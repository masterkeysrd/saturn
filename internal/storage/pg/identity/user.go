package identitypg

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

var _ identity.UserStore = (*UserStore)(nil)

type UserStore struct {
	db      *sqlx.DB
	queries *UserQueries
}

func NewUserStore(db *sqlx.DB) (*UserStore, error) {
	queries, err := NewUserQueries(db)
	if err != nil {
		return nil, fmt.Errorf("cannot initialize user queries: %w", err)
	}

	return &UserStore{
		db:      db,
		queries: queries,
	}, nil
}

func (s *UserStore) Get(ctx context.Context, userID identity.UserID) (*identity.User, error) {
	var entity UserEntity

	row := s.queries.GetByID(ctx, userID)
	if err := row.StructScan(&entity); err != nil {
		return nil, fmt.Errorf("failed to scan query fields: %w", err)
	}

	return entity.ToModel(), nil
}

func (s *UserStore) Store(ctx context.Context, user *identity.User) error {
	entity := NewUserEntityFromModel(user)
	if err := s.queries.Upsert(ctx, entity); err != nil {
		return fmt.Errorf("failed to upsert user: %w", err)
	}
	return nil
}

func (s *UserStore) GetBy(ctx context.Context, criteria identity.GetUserCriteria) (*identity.User, error) {
	query, args, err := s.queries.GetByCriteria(criteria)
	if err != nil {
		return nil, fmt.Errorf("failed to build query: %w", err)
	}

	row, err := s.db.NamedQueryContext(ctx, query, args)
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}
	defer row.Close()

	var entity UserEntity
	if row.Next() {
		if err := row.StructScan(&entity); err != nil {
			return nil, fmt.Errorf("failed to scan query fields: %w", err)
		}
		return entity.ToModel(), nil
	}

	if err := row.Err(); err != nil {
		return nil, fmt.Errorf("query row error: %w", err)
	}

	return nil, fmt.Errorf("user not found")
}

func (s *UserStore) ExistsBy(ctx context.Context, criteria identity.UserExistCriteria) (bool, error) {
	query, args, err := s.queries.ExistsBy(ctx, criteria)
	if err != nil {
		return false, fmt.Errorf("exists query build failed: %w", err)
	}

	row, err := s.db.NamedQueryContext(ctx, query, args)
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
	getUserByIDQuery = `
SELECT 
	id,
	username, 
	email, 
	role, 
	hashed_password, 
	status, 
	created_at, 
	updated_at
FROM 
	identity.users
WHERE 
	id = $1;
`

	getUserByQuery = `
SELECT 
	id,
	username, 
	email, 
	role, 
	hashed_password, 
	status, 
	created_at, 
	updated_at
FROM 
	identity.users
WHERE 
	%s
LIMIT 1;
`

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

	existsByUserQuery = `
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
	getByIDStmt *sqlx.Stmt
	upsertStmt  *sqlx.NamedStmt
}

func NewUserQueries(db *sqlx.DB) (*UserQueries, error) {
	getByIDStmt, err := db.Preparex(getUserByIDQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare get user by ID statement: %w", err)
	}

	upsertStmt, err := db.PrepareNamed(upsertUserQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare upsert user statement: %w", err)
	}

	return &UserQueries{
		getByIDStmt: getByIDStmt,
		upsertStmt:  upsertStmt,
	}, nil
}

func (q *UserQueries) GetByID(ctx context.Context, userID identity.UserID) *sqlx.Row {
	return q.getByIDStmt.QueryRowxContext(ctx, userID)
}

func (q *UserQueries) Upsert(context context.Context, user *UserEntity) error {
	result, err := q.upsertStmt.ExecContext(context, user)
	if err != nil {
		return fmt.Errorf("cannot execute upsert statement: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("cannot obtain affected rows: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no rows were affected during upsert")
	}

	return nil
}

func (q *UserQueries) GetByCriteria(criteria identity.GetUserCriteria) (string, any, error) {
	args := struct {
		Username string `db:"username"`
		Email    string `db:"email"`
	}{}

	query := getUserByQuery
	switch c := criteria.(type) {
	case identity.ByUsernameOrEmail:
		query = fmt.Sprintf(query, "(username = :username OR email = :email)")
		args.Username = string(c)
		args.Email = string(c)
	default:
		return "", nil, fmt.Errorf("unsupported criteria type: %T", criteria)
	}

	return query, args, nil
}

func (q *UserQueries) ExistsBy(context context.Context, criteria identity.UserExistCriteria) (string, any, error) {
	args := struct {
		Username string `db:"username"`
		Email    string `db:"email"`
	}{}

	query := existsByUserQuery
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
