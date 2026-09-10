package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

// userDB is the internal DB record type for identity.user.
type userDB struct {
	ID                  string       `db:"id"`
	Email               string       `db:"email"`
	Username            string       `db:"username"`
	Name                string       `db:"name"`
	AvatarURL           *string      `db:"avatar_url"`
	Status              string       `db:"status"`
	AccessLevel         string       `db:"access_level"`
	Version             int64        `db:"version"`
	AuthVersion         int64        `db:"auth_version"`
	FailedLoginAttempts int          `db:"failed_login_attempts"`
	LockedUntil         sql.NullTime `db:"locked_until"`
	CreateTime          sql.NullTime `db:"create_time"`
	UpdateTime          sql.NullTime `db:"update_time"`
}

// UserStore implements identity.UserStore using db.DB.
type UserStore struct {
	db db.DB
}

// NewUserStore creates a new UserStore.
func NewUserStore(database db.DB) *UserStore {
	return &UserStore{db: database}
}

// toDomainUser converts a userDB to a domain User.
func toDomainUser(u *userDB) *identity.User {
	return &identity.User{
		ID:                  identity.UserID(u.ID),
		Email:               u.Email,
		Username:            u.Username,
		Name:                u.Name,
		AvatarURL:           ptrToString(u.AvatarURL),
		Status:              identity.UserStatus(u.Status),
		AccessLevel:         identity.AccessLevel(u.AccessLevel),
		Version:             u.Version,
		AuthVersion:         u.AuthVersion,
		FailedLoginAttempts: u.FailedLoginAttempts,
		LockedUntil:         nullTimeToTimePtr(u.LockedUntil),
		CreateTime:          nullTimeToTime(u.CreateTime),
		UpdateTime:          nullTimeToTime(u.UpdateTime),
	}
}

// toDB converts a domain User to a userDB.
func toDBUser(u *identity.User) *userDB {
	return &userDB{
		ID:                  string(u.ID),
		Email:               u.Email,
		Username:            u.Username,
		Name:                u.Name,
		AvatarURL:           strToPtr(u.AvatarURL),
		Status:              string(u.Status),
		AccessLevel:         string(u.AccessLevel),
		Version:             u.Version,
		AuthVersion:         u.AuthVersion,
		FailedLoginAttempts: u.FailedLoginAttempts,
		LockedUntil:         timePtrToNullTime(u.LockedUntil),
		CreateTime:          timeToNullTime(u.CreateTime),
		UpdateTime:          timeToNullTime(u.UpdateTime),
	}
}

// Create inserts a new user record.
func (s *UserStore) Create(ctx context.Context, user *identity.User) error {
	const op errors.Op = "domain/identity/storage.Create"

	dbRecord := toDBUser(user)
	q, args, err := pgDialect.Insert(goqu.T("user").Schema("identity")).Rows(
		goqu.Record{
			"id":           dbRecord.ID,
			"email":        dbRecord.Email,
			"username":     dbRecord.Username,
			"name":         dbRecord.Name,
			"avatar_url":   dbRecord.AvatarURL,
			"status":       dbRecord.Status,
			"access_level": dbRecord.AccessLevel,
			"version":      dbRecord.Version,
			"create_time":  goqu.L("NOW()"),
			"update_time":  goqu.L("NOW()"),
		},
	).Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetByID retrieves a user by their unique ID.
func (s *UserStore) GetByID(ctx context.Context, id identity.UserID) (*identity.User, error) {
	const op errors.Op = "domain/identity/storage.GetByID"

	q, args, err := pgDialect.From(goqu.T("user").Schema("identity")).
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var u userDB
	if err := s.db.Get(ctx, &u, q, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainUser(&u), nil
}

// GetByEmail retrieves a user by their email address.
func (s *UserStore) GetByEmail(ctx context.Context, email string) (*identity.User, error) {
	const op errors.Op = "domain/identity/storage.GetByEmail"

	q, args, err := pgDialect.From(goqu.T("user").Schema("identity")).
		Where(goqu.C("email").Eq(email)).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var u userDB
	if err := s.db.Get(ctx, &u, q, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainUser(&u), nil
}

// GetByUsername retrieves a user by their username.
func (s *UserStore) GetByUsername(ctx context.Context, username string) (*identity.User, error) {
	const op errors.Op = "domain/identity/storage.GetByUsername"

	q, args, err := pgDialect.From(goqu.T("user").Schema("identity")).
		Where(goqu.C("username").Eq(username)).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var u userDB
	if err := s.db.Get(ctx, &u, q, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainUser(&u), nil
}

// Update modifies an existing user with optimistic locking.
func (s *UserStore) Update(ctx context.Context, user *identity.User) error {
	const op errors.Op = "domain/identity/storage.Update"

	q, args, err := pgDialect.Update(goqu.T("user").Schema("identity")).
		Set(goqu.Record{
			"email":        user.Email,
			"username":     user.Username,
			"name":         user.Name,
			"avatar_url":   strToPtr(user.AvatarURL),
			"status":       string(user.Status),
			"access_level": string(user.AccessLevel),
			"version":      user.Version + 1,
			"update_time":  goqu.L("NOW()"),
		}).
		Where(
			goqu.C("id").Eq(string(user.ID)),
			goqu.C("version").Eq(user.Version),
		).Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, q, args...); err != nil {
		if errors.Is(err, errors.NotExist) {
			return errors.E(op, errors.Conflict, identity.VersionMismatch, "user not found or version mismatch")
		}
		return errors.E(op, err)
	}
	user.Version++
	return nil
}

// Delete removes a user by their unique ID.
func (s *UserStore) Delete(ctx context.Context, id identity.UserID) error {
	const op errors.Op = "domain/identity/storage.Delete"

	q, args, err := pgDialect.Delete(goqu.T("user").Schema("identity")).
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetUsers returns users with optional filtering and pagination.
func (s *UserStore) GetUsers(ctx context.Context, filter *identity.ListUsersFilter) (*paging.Page[*identity.User], error) {
	const op errors.Op = "domain/identity/storage.GetUsers"

	pageSize := filter.PageSize
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}

	ds := pgDialect.From(goqu.T("user").Schema("identity"))

	if filter.StatusFilter != "" {
		ds = ds.Where(goqu.C("status").Eq(string(filter.StatusFilter)))
	}

	if filter.SearchQuery != "" {
		searchPattern := "%" + filter.SearchQuery + "%"
		ds = ds.Where(goqu.Or(
			goqu.C("email").ILike(searchPattern),
			goqu.C("username").ILike(searchPattern),
			goqu.C("name").ILike(searchPattern),
		))
	}

	cursor, _ := paging.Decode(filter.NextPageToken)

	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sorting.SortOrder{Field: "id", Ascending: true},
		Cursor:   cursor,
		PageSize: uint(pageSize),
		IDColumn: "id",
	})

	q, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbUsers []userDB
	if err := s.db.Select(ctx, &dbUsers, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	users := make([]*identity.User, len(dbUsers))
	for i := range dbUsers {
		users[i] = toDomainUser(&dbUsers[i])
	}

	page := paging.NewPage(users, int(pageSize), func(u *identity.User) paging.Cursor {
		return paging.Cursor{
			SortValue: string(u.ID),
			ID:        string(u.ID),
		}
	})

	return page, nil
}

// GetAuthVersion retrieves the auth_version for a user.
func (s *UserStore) GetAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	const op errors.Op = "domain/identity/storage.GetAuthVersion"

	q, args, err := pgDialect.From(goqu.T("user").Schema("identity")).
		Select("auth_version").
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return 0, errors.E(op, err)
	}

	var authVersion int64
	if err := s.db.Get(ctx, &authVersion, q, args...); err != nil {
		return 0, errors.E(op, err)
	}
	return authVersion, nil
}

// IncrementAuthVersion atomically increments the auth_version for a user.
func (s *UserStore) IncrementAuthVersion(ctx context.Context, id identity.UserID) (int64, error) {
	const op errors.Op = "domain/identity/storage.IncrementAuthVersion"

	q, args, err := pgDialect.Update(goqu.T("user").Schema("identity")).
		Set(goqu.Record{
			"auth_version": goqu.L("auth_version + 1"),
			"update_time":  goqu.L("NOW()"),
		}).
		Where(goqu.C("id").Eq(string(id))).
		Returning("auth_version").
		Prepared(true).
		ToSQL()
	if err != nil {
		return 0, errors.E(op, err)
	}

	var authVersion int64
	if err := s.db.Get(ctx, &authVersion, q, args...); err != nil {
		return 0, errors.E(op, err)
	}
	return authVersion, nil
}

// UpdateLockoutState updates only the failed login attempts and lockout expiration for a user.
func (s *UserStore) UpdateLockoutState(ctx context.Context, req identity.UpdateLockoutRequest) error {
	const op errors.Op = "domain/identity/storage.UpdateLockoutState"

	var nullTime sql.NullTime
	if req.LockedUntil != nil {
		nullTime = sql.NullTime{Time: *req.LockedUntil, Valid: true}
	}

	q, args, err := pgDialect.Update(goqu.T("user").Schema("identity")).
		Set(goqu.Record{
			"failed_login_attempts": req.Attempts,
			"locked_until":          nullTime,
			"update_time":           goqu.L("NOW()"),
		}).
		Where(goqu.C("id").Eq(string(req.UserID))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func nullTimeToTimePtr(nt sql.NullTime) *time.Time {
	if !nt.Valid {
		return nil
	}
	t := nt.Time
	return &t
}

func timePtrToNullTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *t, Valid: true}
}
