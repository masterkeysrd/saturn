package mailaggregator

import (
	"context"
	"fmt"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	appmail "github.com/masterkeysrd/saturn/internal/application/mail"
	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/connector"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"golang.org/x/sync/errgroup"
)

// Service provides aggregated, read-only multi-entity mail projections, hybrid search,
// message body hydration, and ephemeral signed attachment links.
type Service struct {
	mailboxReader     MailboxReader
	threadReader      ThreadReader
	messageReader     MessageReader
	draftReader       DraftReader
	accountReader     ConnectedAccountReader
	tokenManager      *connector.TokenManager
	externalProviders map[string]domainmail.ExternalMailProvider
	hmacSecret        []byte
}

// NewService instantiates a new Mail Aggregator Service.
func NewService(
	mailboxReader MailboxReader,
	threadReader ThreadReader,
	messageReader MessageReader,
	draftReader DraftReader,
	accountReader ConnectedAccountReader,
	tokenManager *connector.TokenManager,
	externalProviders map[string]domainmail.ExternalMailProvider,
	hmacSecret []byte,
) *Service {
	return &Service{
		mailboxReader:     mailboxReader,
		threadReader:      threadReader,
		messageReader:     messageReader,
		draftReader:       draftReader,
		accountReader:     accountReader,
		tokenManager:      tokenManager,
		externalProviders: externalProviders,
		hmacSecret:        hmacSecret,
	}
}

// GetMailbox retrieves a single mailbox by space ID and ID.
func (s *Service) GetMailbox(ctx context.Context, spaceID, id string) (*domainmail.Mailbox, error) {
	const op errors.Op = "aggregator/mail.GetMailbox"

	mbx, err := s.mailboxReader.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if mbx == nil {
		return nil, errors.E(op, errors.NotExist, domainmail.ErrMailboxNotFound, "mailbox not found")
	}
	return mbx, nil
}

// ListMailboxes retrieves mailboxes matching optional filter criteria.
func (s *Service) ListMailboxes(ctx context.Context, spaceID string, filter *domainmail.ListMailboxesFilter) ([]*domainmail.Mailbox, error) {
	const op errors.Op = "aggregator/mail.ListMailboxes"

	list, err := s.mailboxReader.ListBySpace(ctx, spaceID, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return list, nil
}

// ListThreads retrieves threads, performing hybrid search (local FTS + upstream provider) if a query is present.
func (s *Service) ListThreads(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) ([]*domainmail.Thread, int, error) {
	const op errors.Op = "aggregator/mail.ListThreads"

	if filter == nil {
		filter = &domainmail.ListThreadsFilter{Limit: 50}
	}
	if filter.Limit <= 0 {
		filter.Limit = 50
	}

	trimmedQuery := strings.TrimSpace(filter.Query)
	if trimmedQuery == "" {
		threads, err := s.threadReader.ListBySpace(ctx, spaceID, filter)
		if err != nil {
			return nil, 0, errors.E(op, err)
		}
		total, err := s.threadReader.CountBySpace(ctx, spaceID, filter)
		if err != nil {
			return nil, 0, errors.E(op, err)
		}
		return threads, total, nil
	}

	// Hybrid Search: run local FTS and upstream provider queries concurrently
	return s.hybridSearchThreads(ctx, spaceID, filter)
}

func (s *Service) hybridSearchThreads(ctx context.Context, spaceID string, filter *domainmail.ListThreadsFilter) ([]*domainmail.Thread, int, error) {
	const op errors.Op = "aggregator/mail.hybridSearchThreads"

	g, ctx := errgroup.WithContext(ctx)

	var (
		localResults []*domainmail.Thread
		localTotal   int
		localErr     error
	)

	// 1. Run local FTS query using cumulative window so merged pagination does not double-apply offset
	localFilter := *filter
	localFilter.Offset = 0
	localFilter.Limit = filter.Offset + filter.Limit + 1

	g.Go(func() error {
		res, err := s.threadReader.ListBySpace(ctx, spaceID, &localFilter)
		if err != nil {
			localErr = err
			return err
		}
		localResults = res
		if count, countErr := s.threadReader.CountBySpace(ctx, spaceID, &localFilter); countErr == nil {
			localTotal = count
		}
		return nil
	})

	// 2. Concurrently query upstream external providers across connected accounts
	var (
		remoteMu      sync.Mutex
		remoteResults []*domainmail.Thread
	)

	g.Go(func() error {
		if s.accountReader == nil || s.tokenManager == nil {
			return nil
		}

		accounts, err := s.accountReader.ListAccounts(ctx, spaceID)
		if err != nil {
			return errors.E(op, err)
		}

		for _, acc := range accounts {
			if !slices.Contains(acc.EnabledCapabilities, string(connector.CapabilityMail)) {
				continue
			}

			prov, ok := s.externalProviders[acc.Provider]
			if !ok {
				continue
			}

			token, err := s.tokenManager.TokenSource(ctx, spaceID, acc.ID)
			if err != nil {
				continue
			}

			rThreads, err := prov.SearchThreads(ctx, token, filter.Query, localFilter.Limit)
			if err != nil {
				continue
			}

			remoteMu.Lock()
			for _, rt := range rThreads {
				rt.SpaceID = spaceID
				rt.ConnectedAccountID = acc.ID
				if rt.ProviderThreadID != nil && *rt.ProviderThreadID != "" {
					existing, err := s.threadReader.GetByProviderID(ctx, spaceID, acc.ID, *rt.ProviderThreadID)
					if err == nil && existing != nil {
						rt.ID = existing.ID
					}
				}
				remoteResults = append(remoteResults, rt)
			}
			remoteMu.Unlock()
		}
		return nil
	})

	if err := g.Wait(); err != nil && localErr != nil {
		return nil, 0, errors.E(op, localErr)
	}

	// 3. Merge and deduplicate by thread ID / provider thread ID
	seenMap := make(map[string]struct{})
	var merged []*domainmail.Thread

	for _, th := range localResults {
		key := th.ID
		if th.ProviderThreadID != nil && *th.ProviderThreadID != "" {
			key = *th.ProviderThreadID
		}
		seenMap[key] = struct{}{}
		merged = append(merged, th)
	}

	for _, th := range remoteResults {
		key := th.ID
		if th.ProviderThreadID != nil && *th.ProviderThreadID != "" {
			key = *th.ProviderThreadID
		}
		if _, exists := seenMap[key]; !exists {
			seenMap[key] = struct{}{}
			merged = append(merged, th)
		}
	}

	// 4. Sort chronologically by LastMessageAt descending
	sort.Slice(merged, func(i, j int) bool {
		return merged[i].LastMessageAt.After(merged[j].LastMessageAt)
	})

	totalCount := max(len(merged), localTotal)

	// Apply offset and limit
	start := min(filter.Offset, len(merged))
	end := min(start+filter.Limit, len(merged))

	return merged[start:end], totalCount, nil
}

// GetThread retrieves a single thread and hydrates all its messages, bodies, and signed attachment URLs.
func (s *Service) GetThread(ctx context.Context, spaceID, id string) (*ThreadProjection, error) {
	const op errors.Op = "aggregator/mail.GetThread"

	thread, err := s.threadReader.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if thread == nil {
		return nil, errors.E(op, errors.NotExist, domainmail.ErrThreadNotFound, "thread not found")
	}

	messages, err := s.messageReader.ListByThreadID(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}

	// On-demand message hydration if thread was synced without messages or discovered via search
	if len(messages) == 0 && thread.ProviderThreadID != nil && *thread.ProviderThreadID != "" && s.accountReader != nil {
		acc, err := s.accountReader.GetAccount(ctx, spaceID, thread.ConnectedAccountID)
		if err == nil && acc != nil {
			if prov, ok := s.externalProviders[acc.Provider]; ok {
				if token, err := s.tokenManager.TokenSource(ctx, spaceID, thread.ConnectedAccountID); err == nil {
					remoteThread, remoteMsgs, err := prov.FetchThread(ctx, token, *thread.ProviderThreadID)
					if err == nil && remoteThread != nil && len(remoteMsgs) > 0 {
						for _, rMsg := range remoteMsgs {
							rMsg.SpaceID = spaceID
							rMsg.ConnectedAccountID = thread.ConnectedAccountID
							rMsg.ThreadID = thread.ID
							_ = s.messageReader.Upsert(ctx, rMsg)
						}
						messages = remoteMsgs
					}
				}
			}
		}
	}

	var messageProjections []*MessageProjection
	for _, msg := range messages {
		proj, err := s.hydrateMessage(ctx, spaceID, msg)
		if err != nil {
			// If body hydration fails for a single message, gracefully fall back to snippet
			proj = &MessageProjection{
				Message:   msg,
				BodyPlain: msg.Snippet,
			}
		}
		messageProjections = append(messageProjections, proj)
	}

	return &ThreadProjection{
		Thread:   thread,
		Messages: messageProjections,
	}, nil
}

func (s *Service) hydrateMessage(ctx context.Context, spaceID string, msg *domainmail.Message) (*MessageProjection, error) {
	const op errors.Op = "aggregator/mail.hydrateMessage"

	var bodyHTML, bodyPlain string

	body, err := s.messageReader.GetBody(ctx, spaceID, msg.ID)
	if err == nil && body != nil {
		bodyHTML = body.SanitizedHTML
		bodyPlain = body.PlainText
	} else if msg.ConnectedAccountID != "" && msg.ProviderMessageID != nil && *msg.ProviderMessageID != "" && s.accountReader != nil {
		acc, err := s.accountReader.GetAccount(ctx, spaceID, msg.ConnectedAccountID)
		if err == nil && acc != nil {
			if prov, ok := s.externalProviders[acc.Provider]; ok {
				if token, err := s.tokenManager.TokenSource(ctx, spaceID, msg.ConnectedAccountID); err == nil {
					if fetchedBody, err := prov.FetchMessageBody(ctx, token, *msg.ProviderMessageID); err == nil && fetchedBody != nil {
						bodyHTML = fetchedBody.SanitizedHTML
						bodyPlain = fetchedBody.PlainText
						fetchedBody.MessageID = msg.ID
						fetchedBody.SpaceID = spaceID
						_ = s.messageReader.SaveBody(ctx, fetchedBody)
						msg.BodyCached = true
						msg.HasRemoteImages = fetchedBody.HasRemoteImages
					}
				}
			}
		}
	}

	// Fallback to snippet if body content is empty
	if bodyHTML == "" && bodyPlain == "" && msg.Snippet != "" {
		bodyPlain = msg.Snippet
	}

	// Mint 5-minute ephemeral signed download links for every attachment
	var attachmentProjections []*AttachmentProjection
	for _, att := range msg.Attachments {
		disposition := "attachment"
		if att.IsInline {
			disposition = "inline"
		}

		claims := appmail.AttachmentTokenClaims{
			SpaceID:      spaceID,
			MessageID:    msg.ID,
			AttachmentID: att.ID,
			Disposition:  disposition,
			ExpiresAt:    time.Now().Add(5 * time.Minute).Unix(),
		}

		token, err := appmail.MintAttachmentToken(claims, s.hmacSecret)
		if err != nil {
			return nil, errors.E(op, err)
		}

		attachmentProjections = append(attachmentProjections, &AttachmentProjection{
			Meta:        att,
			DownloadURL: fmt.Sprintf("/api/v1/mail/attachments/%s", token),
		})
	}

	// Map CID inline attachments in bodyHTML to their minted download URLs
	for _, ap := range attachmentProjections {
		if ap.Meta.ContentID != "" {
			cidClean := strings.Trim(ap.Meta.ContentID, "<>")
			bodyHTML = strings.ReplaceAll(bodyHTML, "cid:"+cidClean, ap.DownloadURL)
			bodyHTML = strings.ReplaceAll(bodyHTML, "CID:"+cidClean, ap.DownloadURL)
			bodyHTML = strings.ReplaceAll(bodyHTML, "cid:<"+cidClean+">", ap.DownloadURL)
			bodyHTML = strings.ReplaceAll(bodyHTML, "CID:<"+cidClean+">", ap.DownloadURL)
		}
		if ap.Meta.Filename != "" && ap.Meta.IsInline {
			bodyHTML = strings.ReplaceAll(bodyHTML, "cid:"+ap.Meta.Filename, ap.DownloadURL)
			bodyHTML = strings.ReplaceAll(bodyHTML, "CID:"+ap.Meta.Filename, ap.DownloadURL)
		}
	}

	return &MessageProjection{
		Message:     msg,
		BodyHTML:    bodyHTML,
		BodyPlain:   bodyPlain,
		Attachments: attachmentProjections,
	}, nil
}

// GetDraft retrieves a draft by ID.
func (s *Service) GetDraft(ctx context.Context, spaceID, id string) (*domainmail.Draft, error) {
	const op errors.Op = "aggregator/mail.GetDraft"

	draft, err := s.draftReader.GetByID(ctx, spaceID, id)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if draft == nil {
		return nil, errors.E(op, errors.NotExist, domainmail.ErrDraftNotFound, "draft not found")
	}
	return draft, nil
}

// ListDrafts retrieves drafts matching filter criteria.
func (s *Service) ListDrafts(ctx context.Context, spaceID string, filter *domainmail.ListDraftsFilter) ([]*domainmail.Draft, error) {
	const op errors.Op = "aggregator/mail.ListDrafts"

	drafts, err := s.draftReader.ListBySpace(ctx, spaceID, filter)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return drafts, nil
}
