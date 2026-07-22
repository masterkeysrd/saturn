package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

type securityEventDB struct {
	ID        string       `db:"id"`
	UserID    *string      `db:"user_id"`
	Email     string       `db:"email"`
	EventType string       `db:"event_type"`
	IPAddress string       `db:"ip_address"`
	UserAgent *string      `db:"user_agent"`
	CreatedAt sql.NullTime `db:"created_at"`
}

// SecurityEventStore implements identity.SecurityEventStore using sqlx.
type SecurityEventStore struct {
	db *sqlx.DB
}

// NewSecurityEventStore creates a new SQL store for security audit events.
func NewSecurityEventStore(db *sqlx.DB) *SecurityEventStore {
	return &SecurityEventStore{db: db}
}

// Create inserts a new security audit event record.
func (s *SecurityEventStore) Create(ctx context.Context, event *identity.SecurityEvent) error {
	var userID *string
	if event.UserID != nil {
		str := string(*event.UserID)
		userID = &str
	}
	var ua *string
	if event.UserAgent != "" {
		ua = &event.UserAgent
	}
	query := `INSERT INTO identity.security_events (id, user_id, email, event_type, ip_address, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())`
	_, err := s.db.ExecContext(ctx, query, event.ID, userID, event.Email, string(event.EventType), event.IPAddress, ua)
	return err
}

// List retrieves security audit events satisfying the filter conditions.
func (s *SecurityEventStore) List(ctx context.Context, filter identity.SecurityEventFilter) ([]*identity.SecurityEvent, string, error) {
	var args []interface{}
	var conditions []string

	if filter.UserID != nil {
		conditions = append(conditions, fmt.Sprintf("user_id = $%d", len(args)+1))
		args = append(args, string(*filter.UserID))
	}
	if filter.Email != "" {
		conditions = append(conditions, fmt.Sprintf("email = $%d", len(args)+1))
		args = append(args, filter.Email)
	}
	if filter.EventType != "" {
		conditions = append(conditions, fmt.Sprintf("event_type = $%d", len(args)+1))
		args = append(args, filter.EventType)
	}

	if filter.NextPageToken != "" {
		var cursorID string
		if decoded, err := base64.URLEncoding.DecodeString(filter.NextPageToken); err == nil {
			cursorID = string(decoded)
		} else {
			cursorID = filter.NextPageToken
		}
		if cursorID != "" {
			conditions = append(conditions, fmt.Sprintf("id < $%d", len(args)+1))
			args = append(args, cursorID)
		}
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	limitPlus1 := limit + 1

	query := fmt.Sprintf("SELECT * FROM identity.security_events %s ORDER BY id DESC LIMIT $%d", whereClause, len(args)+1)
	args = append(args, limitPlus1)

	var dbEvents []securityEventDB
	err := s.db.SelectContext(ctx, &dbEvents, query, args...)
	if err != nil {
		return nil, "", err
	}

	hasMore := len(dbEvents) > limit
	if hasMore {
		dbEvents = dbEvents[:limit]
	}

	events := make([]*identity.SecurityEvent, 0, len(dbEvents))
	for _, dbEv := range dbEvents {
		var uID *identity.UserID
		if dbEv.UserID != nil {
			val := identity.UserID(*dbEv.UserID)
			uID = &val
		}
		var ua string
		if dbEv.UserAgent != nil {
			ua = *dbEv.UserAgent
		}
		events = append(events, &identity.SecurityEvent{
			ID:        dbEv.ID,
			UserID:    uID,
			Email:     dbEv.Email,
			EventType: identity.SecurityEventType(dbEv.EventType),
			IPAddress: dbEv.IPAddress,
			UserAgent: ua,
			CreatedAt: dbEv.CreatedAt.Time,
		})
	}

	var nextToken string
	if hasMore && len(dbEvents) > 0 {
		nextToken = base64.URLEncoding.EncodeToString([]byte(dbEvents[len(dbEvents)-1].ID))
	}

	return events, nextToken, nil
}
