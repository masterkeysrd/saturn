package workflow

import (
	"database/sql"
	"time"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/masterkeysrd/saturn/internal/platform/db"
)

var pgDialect = goqu.Dialect("postgres")

// PostgresStore aggregates the PostgreSQL implementations of all workflow stores.
type PostgresStore struct {
	flows    *PostgresFlowStore
	triggers *PostgresTriggerStore
	flowRuns *PostgresFlowRunStore
	stepRuns *PostgresStepRunStore
}

// NewStore creates a new PostgreSQL workflow Store.
func NewStore(database db.DB) *PostgresStore {
	stepRuns := NewStepRunStore(database)
	triggers := NewTriggerStore(database)
	return &PostgresStore{
		flows:    NewFlowStore(database, triggers),
		triggers: triggers,
		flowRuns: NewFlowRunStore(database, stepRuns),
		stepRuns: stepRuns,
	}
}

// Flows returns the FlowStore implementation.
func (s *PostgresStore) Flows() FlowStore {
	return s.flows
}

// Triggers returns the TriggerStore implementation.
func (s *PostgresStore) Triggers() TriggerStore {
	return s.triggers
}

// FlowRuns returns the FlowRunStore implementation.
func (s *PostgresStore) FlowRuns() FlowRunStore {
	return s.flowRuns
}

// StepRuns returns the StepRunStore implementation.
func (s *PostgresStore) StepRuns() StepRunStore {
	return s.stepRuns
}

func strPtrToNullStr(s *string) sql.NullString {
	if s == nil || *s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}

func timePtrToNullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *t, Valid: true}
}

func nullableBytes(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}
