package identitypg

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

var _ identity.UserStore = (*UserRepository)(nil)

type UserRepository struct {
	db      *sqlx.DB
	queries *UserQueries
}

func NewUserRepository(db *sqlx.DB) (*UserRepository, error) {
	queries, err := NewUserQueries(db)
	if err != nil {
		return nil, fmt.Errorf("cannot initialize user queries: %w", err)
	}

	return &UserRepository{
		db:      db,
		queries: queries,
	}, nil
}

func (r *UserRepository) Store(ctx context.Context, user *identity.User) error {
	entity := NewUserEntityFromModel(user)
	if err := r.queries.Upsert(ctx, entity); err != nil {
		return fmt.Errorf("cannot store user: %w", err)
	}
	return nil
}

func (r *UserRepository) ExistsBy(ctx context.Context, criteria identity.UserExistCriteria) (bool, error) {
	query, args, err := r.queries.ExitsBy(ctx, criteria)
	if err != nil {
		return false, fmt.Errorf("exists query build failed: %w", err)
	}

	row, err := r.db.NamedQueryContext(ctx, query, args)
	if err != nil {
		return false, fmt.Errorf("exists query execution failed: %w", err)
	}
	defer row.Close()

	if row.Next() {
		return true, nil
	}

	if err := row.Err(); err != nil {
		return false, fmt.Errorf("exists query row error: %w", err)
	}

	return false, nil
}

const (
	upsertUserQuery = `
INSERT INTO 
	identity.users (
		id,
		username, 
		email, 
		role, 
		hashed_password, 
		status, 
		created_at, 
		updated_at
	)
VALUES 
	(:id, :username, :email, :role, :hashed_password, :status, :created_at, :updated_at)
ON CONFLICT (id) DO 
UPDATE SET
	username = EXCLUDED.username,
	email = EXCLUDED.email,
	role = EXCLUDED.role,
	hashed_password = EXCLUDED.hashed_password,
	status = EXCLUDED.status,
	updated_at = EXCLUDED.updated_at;
`

	exitsByUserQuery = `
SELECT 
	1
FROM 
	identity.users
WHERE 
	%s
LIMIT 1;
`
)

type UserQueries struct {
	upsertStmt *sqlx.NamedStmt
}

func NewUserQueries(db *sqlx.DB) (*UserQueries, error) {
	upsertStmt, err := db.PrepareNamed(upsertUserQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare upsert user statement: %w", err)
	}

	return &UserQueries{
		upsertStmt: upsertStmt,
	}, nil
}

func (e *UserQueries) Upsert(context context.Context, user *UserEntity) error {
	result, err := e.upsertStmt.ExecContext(context, user)
	if err != nil {
		return fmt.Errorf("failed to execute upsert user statement: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for upsert user: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no rows affected for upsert user")
	}

	return nil
}

func (e *UserQueries) ExitsBy(context context.Context, criteria identity.UserExistCriteria) (string, any, error) {
	args := struct {
		Username string `db:"username"`
		Email    string `db:"email"`
	}{}

	query := exitsByUserQuery
	switch c := criteria.(type) {
	case identity.ByUsername:
		query = fmt.Sprintf(query, "username = :username")
		args.Username = string(c)
	case identity.ByEmail:
		query = fmt.Sprintf(query, "email = :email")
		args.Email = string(c)
	default:
		return "", nil, fmt.Errorf("unsupported criteria type: %T", criteria)
	}

	return query, args, nil
}

type UserEntity struct {
	ID             identity.UserID     `db:"id"`
	Username       string              `db:"username"`
	Email          string              `db:"email"`
	Role           auth.Role           `db:"role"`
	HashedPassword string              `db:"hashed_password"`
	Status         identity.UserStatus `db:"status"`
	CreatedAt      time.Time           `db:"created_at"`
	UpdatedAt      time.Time           `db:"updated_at"`
}

func NewUserEntityFromModel(user *identity.User) *UserEntity {
	return &UserEntity{
		ID:             user.ID,
		Username:       user.Username,
		Email:          user.Email,
		Role:           user.Role,
		HashedPassword: user.HashedPassword,
		Status:         user.Status,
		CreatedAt:      user.CreatedAt,
		UpdatedAt:      user.UpdatedAt,
	}
}

func (e *UserEntity) ToModel() *identity.User {
	return &identity.User{
		ID:             e.ID,
		Username:       e.Username,
		Email:          e.Email,
		Role:           e.Role,
		HashedPassword: e.HashedPassword,
		Status:         e.Status,
		CreatedAt:      e.CreatedAt,
		UpdatedAt:      e.UpdatedAt,
	}
}
