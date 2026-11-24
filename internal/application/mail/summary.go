package mail

import (
	"context"
	"strings"
	"time"

	domainmail "github.com/masterkeysrd/saturn/internal/domain/mail"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	platformi18n "github.com/masterkeysrd/saturn/internal/platform/i18n"
)

// normalizeSummaryLanguage resolves the summary language for a request,
// preferring an explicit request override, then the negotiated request
// language, and finally falling back to the platform default.
func normalizeSummaryLanguage(requested string, ctx context.Context) string {
	lang := strings.ToLower(strings.TrimSpace(requested))
	if lang == "" {
		lang = strings.ToLower(strings.TrimSpace(platformi18n.From(ctx)))
	}
	if strings.HasPrefix(lang, "es") {
		return "es"
	}
	return platformi18n.DefaultLanguage
}

// SaveThreadSummary validates and persists a thread summary produced by a workflow run.
func (c *coordinator) SaveThreadSummary(ctx context.Context, req *SaveThreadSummaryRequest) (*domainmail.ThreadSummary, error) {
	const op errors.Op = "application/mail.SaveThreadSummary"

	if req == nil || req.Summary == nil {
		return nil, errors.E(op, errors.Invalid, "thread summary is required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	summary := req.Summary
	summary.SpaceID = spaceID
	if summary.Language == "" {
		summary.Language = platformi18n.DefaultLanguage
	}
	if err := summary.Validate(); err != nil {
		return nil, errors.E(op, err)
	}

	now := time.Now().UTC()
	if summary.CreateTime.IsZero() {
		summary.CreateTime = now
	}
	summary.UpdateTime = now

	if err := c.summaryStore.Upsert(ctx, summary); err != nil {
		return nil, errors.E(op, err)
	}
	return summary, nil
}

// SummarizeThread generates or refreshes the AI summary of a thread. Any
// space member (including viewers) may summarize threads they can read.
// Deliberately non-transactional so no DB transaction is held open during
// the LLM-backed system flow execution.
func (c *coordinator) SummarizeThread(ctx context.Context, req *SummarizeThreadRequest) (*domainmail.ThreadSummary, error) {
	const op errors.Op = "application/mail.SummarizeThread"

	if req == nil || strings.TrimSpace(req.ID) == "" {
		return nil, errors.E(op, errors.Invalid, "thread id is required")
	}

	spaceID, err := c.getSpaceID(ctx, op)
	if err != nil {
		return nil, err
	}

	thread, err := c.threadStore.GetByID(ctx, spaceID, strings.TrimSpace(req.ID))
	if err != nil {
		return nil, errors.E(op, err)
	}
	if thread == nil {
		return nil, errors.E(op, errors.NotExist, domainmail.ErrThreadNotFound, "thread not found")
	}

	language := normalizeSummaryLanguage(req.Language, ctx)

	if !req.ForceRegenerate {
		existing, err := c.summaryStore.Get(ctx, spaceID, thread.ID, language)
		if err != nil {
			return nil, errors.E(op, err)
		}
		if existing != nil && !existing.IsStale(thread) {
			return existing, nil
		}
	}

	run, err := c.summarizeFlow.Execute(ctx, SummarizeThreadFlowInput{
		ThreadID: thread.ID,
		Language: language,
	})
	if err != nil {
		return nil, errors.E(op, err)
	}
	flowRunID := run.ID

	summary, err := c.summaryStore.Get(ctx, spaceID, thread.ID, language)
	if err != nil {
		return nil, errors.E(op, err)
	}
	if summary == nil {
		return nil, errors.E(op, errors.Internal, "summarize flow did not persist a thread summary")
	}
	if summary.FlowRunID == nil && flowRunID != "" {
		summary.FlowRunID = &flowRunID
		if err := c.summaryStore.Upsert(ctx, summary); err != nil {
			return nil, errors.E(op, err)
		}
	}
	return summary, nil
}
