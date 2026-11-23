package storage

import (
	"context"
	"database/sql"
	"time"

	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type oauthClientDB struct {
	ID                      string         `db:"id"`
	SpaceID                 sql.NullString `db:"space_id"`
	Name                    string         `db:"name"`
	Description             string         `db:"description"`
	SecretPrefix            string         `db:"secret_prefix"`
	SecretHash              sql.NullString `db:"secret_hash"`
	RedirectURIs            pq.StringArray `db:"redirect_uris"`
	AllowedScopes           pq.StringArray `db:"allowed_scopes"`
	TokenEndpointAuthMethod string         `db:"token_endpoint_auth_method"`
	RefreshTokenPolicy      string         `db:"refresh_token_policy"`
	RegistrationSource      string         `db:"registration_source"`
	MetadataETag            string         `db:"metadata_etag"`
	MetadataFetchedAt       sql.NullTime   `db:"metadata_fetched_at"`
	CreateTime              time.Time      `db:"create_time"`
	UpdateTime              time.Time      `db:"update_time"`
}

func toDomainOAuthClient(rec *oauthClientDB) *identity.OAuthClient {
	var spaceID *string
	if rec.SpaceID.Valid && rec.SpaceID.String != "" {
		spaceID = new(rec.SpaceID.String)
	}
	return &identity.OAuthClient{
		ID:                      identity.OAuthClientID(rec.ID),
		SpaceID:                 spaceID,
		Name:                    rec.Name,
		Description:             rec.Description,
		SecretPrefix:            rec.SecretPrefix,
		SecretHash:              rec.SecretHash.String,
		RedirectURIs:            []string(rec.RedirectURIs),
		AllowedScopes:           []string(rec.AllowedScopes),
		TokenEndpointAuthMethod: identity.TokenEndpointAuthMethod(rec.TokenEndpointAuthMethod),
		RefreshTokenPolicy:      identity.RefreshTokenPolicy(rec.RefreshTokenPolicy),
		RegistrationSource:      identity.RegistrationSource(rec.RegistrationSource),
		MetadataETag:            rec.MetadataETag,
		MetadataFetchedAt:       nullTimeToTimePtr(rec.MetadataFetchedAt),
		CreateTime:              rec.CreateTime,
		UpdateTime:              rec.UpdateTime,
	}
}

func toNullString(p *string) sql.NullString {
	if p == nil || *p == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: *p, Valid: true}
}

func strToNullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func nonNilStringArray(s []string) pq.StringArray {
	if s == nil {
		return pq.StringArray{}
	}
	return pq.StringArray(s)
}

// OAuthClientStore implements identity.OAuthClientStore using PostgreSQL.
type OAuthClientStore struct {
	db db.DB
}

// NewOAuthClientStore creates a new OAuthClientStore.
func NewOAuthClientStore(database db.DB) *OAuthClientStore {
	return &OAuthClientStore{db: database}
}

// Create inserts a new OAuth client record.
func (s *OAuthClientStore) Create(ctx context.Context, client *identity.OAuthClient) error {
	const op errors.Op = "domain/identity/storage.CreateOAuthClient"

	const query = `
		INSERT INTO identity.oauth_clients (
			id, space_id, name, description, secret_prefix, secret_hash,
			redirect_uris, allowed_scopes, token_endpoint_auth_method, refresh_token_policy,
			registration_source, metadata_etag, metadata_fetched_at, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
	`

	if _, err := s.db.Exec(
		ctx,
		query,
		string(client.ID),
		toNullString(client.SpaceID),
		client.Name,
		client.Description,
		client.SecretPrefix,
		strToNullString(client.SecretHash),
		nonNilStringArray(client.RedirectURIs),
		nonNilStringArray(client.AllowedScopes),
		string(client.TokenEndpointAuthMethod),
		string(client.RefreshTokenPolicy),
		string(client.RegistrationSource),
		client.MetadataETag,
		timePtrToNullTime(client.MetadataFetchedAt),
		client.CreateTime,
		client.UpdateTime,
	); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// UpsertCIMD inserts or updates a cached CIMD client record by canonical URL ID.
func (s *OAuthClientStore) UpsertCIMD(ctx context.Context, client *identity.OAuthClient) error {
	const op errors.Op = "domain/identity/storage.UpsertCIMDOAuthClient"

	const query = `
		INSERT INTO identity.oauth_clients (
			id, space_id, name, description, secret_prefix, secret_hash,
			redirect_uris, allowed_scopes, token_endpoint_auth_method, refresh_token_policy,
			registration_source, metadata_etag, metadata_fetched_at, create_time, update_time
		) VALUES ($1, NULL, $2, $3, '', NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			redirect_uris = EXCLUDED.redirect_uris,
			allowed_scopes = EXCLUDED.allowed_scopes,
			token_endpoint_auth_method = EXCLUDED.token_endpoint_auth_method,
			refresh_token_policy = EXCLUDED.refresh_token_policy,
			metadata_etag = EXCLUDED.metadata_etag,
			metadata_fetched_at = EXCLUDED.metadata_fetched_at,
			update_time = EXCLUDED.update_time
	`

	if _, err := s.db.Exec(
		ctx,
		query,
		string(client.ID),
		client.Name,
		client.Description,
		nonNilStringArray(client.RedirectURIs),
		nonNilStringArray(client.AllowedScopes),
		string(client.TokenEndpointAuthMethod),
		string(client.RefreshTokenPolicy),
		string(client.RegistrationSource),
		client.MetadataETag,
		timePtrToNullTime(client.MetadataFetchedAt),
		client.CreateTime,
		client.UpdateTime,
	); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetByID retrieves an OAuth client by ID.
func (s *OAuthClientStore) GetByID(ctx context.Context, id identity.OAuthClientID) (*identity.OAuthClient, error) {
	const op errors.Op = "domain/identity/storage.GetOAuthClientByID"

	const query = `
		SELECT id, space_id, name, description, secret_prefix, secret_hash,
		       redirect_uris, allowed_scopes, token_endpoint_auth_method, refresh_token_policy,
		       registration_source, metadata_etag, metadata_fetched_at, create_time, update_time
		FROM identity.oauth_clients
		WHERE id = $1
	`

	var rec oauthClientDB
	if err := s.db.Get(ctx, &rec, query, string(id)); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainOAuthClient(&rec), nil
}

// ListByIDs retrieves OAuth clients matching the provided IDs.
func (s *OAuthClientStore) ListByIDs(ctx context.Context, ids []identity.OAuthClientID) ([]*identity.OAuthClient, error) {
	const op errors.Op = "domain/identity/storage.ListOAuthClientsByIDs"

	if len(ids) == 0 {
		return nil, nil
	}

	rawIDs := make([]string, len(ids))
	for i, id := range ids {
		rawIDs[i] = string(id)
	}

	const query = `
		SELECT id, space_id, name, description, secret_prefix, secret_hash,
		       redirect_uris, allowed_scopes, token_endpoint_auth_method, refresh_token_policy,
		       registration_source, metadata_etag, metadata_fetched_at, create_time, update_time
		FROM identity.oauth_clients
		WHERE id = ANY($1)
	`

	var recs []oauthClientDB
	if err := s.db.Select(ctx, &recs, query, pq.Array(rawIDs)); err != nil {
		return nil, errors.E(op, err)
	}

	clients := make([]*identity.OAuthClient, len(recs))
	for i := range recs {
		clients[i] = toDomainOAuthClient(&recs[i])
	}
	return clients, nil
}

// ListInstanceClients retrieves global instance clients plus DCR/CIMD registrations ordered newest first.
func (s *OAuthClientStore) ListInstanceClients(ctx context.Context) ([]*identity.OAuthClient, error) {
	const op errors.Op = "domain/identity/storage.ListInstanceOAuthClients"

	const query = `
		SELECT id, space_id, name, description, secret_prefix, secret_hash,
		       redirect_uris, allowed_scopes, token_endpoint_auth_method, refresh_token_policy,
		       registration_source, metadata_etag, metadata_fetched_at, create_time, update_time
		FROM identity.oauth_clients
		WHERE space_id IS NULL OR registration_source IN ('dcr', 'cimd')
		ORDER BY create_time DESC
	`

	var recs []oauthClientDB
	if err := s.db.Select(ctx, &recs, query); err != nil {
		return nil, errors.E(op, err)
	}

	clients := make([]*identity.OAuthClient, len(recs))
	for i := range recs {
		clients[i] = toDomainOAuthClient(&recs[i])
	}
	return clients, nil
}

// ListBySpaceID retrieves OAuth clients registered for a specific workspace ordered newest first.
func (s *OAuthClientStore) ListBySpaceID(ctx context.Context, spaceID string) ([]*identity.OAuthClient, error) {
	const op errors.Op = "domain/identity/storage.ListOAuthClientsBySpaceID"

	const query = `
		SELECT id, space_id, name, description, secret_prefix, secret_hash,
		       redirect_uris, allowed_scopes, token_endpoint_auth_method, refresh_token_policy,
		       registration_source, metadata_etag, metadata_fetched_at, create_time, update_time
		FROM identity.oauth_clients
		WHERE space_id = $1
		ORDER BY create_time DESC
	`

	var recs []oauthClientDB
	if err := s.db.Select(ctx, &recs, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}

	clients := make([]*identity.OAuthClient, len(recs))
	for i := range recs {
		clients[i] = toDomainOAuthClient(&recs[i])
	}
	return clients, nil
}

// Update persists updated mutable fields for an OAuth client.
func (s *OAuthClientStore) Update(ctx context.Context, client *identity.OAuthClient) error {
	const op errors.Op = "domain/identity/storage.UpdateOAuthClient"

	const query = `
		UPDATE identity.oauth_clients
		SET name = $1,
		    description = $2,
		    secret_prefix = $3,
		    secret_hash = $4,
		    redirect_uris = $5,
		    allowed_scopes = $6,
		    token_endpoint_auth_method = $7,
		    refresh_token_policy = $8,
		    update_time = $9
		WHERE id = $10
	`

	if err := s.db.ExecOne(
		ctx,
		query,
		client.Name,
		client.Description,
		client.SecretPrefix,
		strToNullString(client.SecretHash),
		nonNilStringArray(client.RedirectURIs),
		nonNilStringArray(client.AllowedScopes),
		string(client.TokenEndpointAuthMethod),
		string(client.RefreshTokenPolicy),
		client.UpdateTime,
		string(client.ID),
	); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// UpdateSecret updates the client secret prefix and hash for an OAuth client.
func (s *OAuthClientStore) UpdateSecret(ctx context.Context, id identity.OAuthClientID, secretPrefix, secretHash string, updateTime time.Time) error {
	const op errors.Op = "domain/identity/storage.UpdateOAuthClientSecret"

	const query = `
		UPDATE identity.oauth_clients
		SET secret_prefix = $1, secret_hash = $2, update_time = $3
		WHERE id = $4
	`

	if err := s.db.ExecOne(ctx, query, secretPrefix, strToNullString(secretHash), updateTime, string(id)); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// Delete removes an OAuth client by ID.
func (s *OAuthClientStore) Delete(ctx context.Context, id identity.OAuthClientID) error {
	const op errors.Op = "domain/identity/storage.DeleteOAuthClient"

	const query = `DELETE FROM identity.oauth_clients WHERE id = $1`
	if err := s.db.ExecOne(ctx, query, string(id)); err != nil {
		return errors.E(op, err)
	}
	return nil
}

type oauthGrantDB struct {
	ID                        string         `db:"id"`
	ClientID                  string         `db:"client_id"`
	UserID                    string         `db:"user_id"`
	SpaceID                   string         `db:"space_id"`
	Scopes                    pq.StringArray `db:"scopes"`
	RefreshTokenHash          sql.NullString `db:"refresh_token_hash"`
	PreviousRefreshTokenHash  sql.NullString `db:"previous_refresh_token_hash"`
	PreviousRefreshGraceUntil sql.NullTime   `db:"previous_refresh_grace_until"`
	RefreshExpiresAt          sql.NullTime   `db:"refresh_expires_at"`
	LastUsedAt                sql.NullTime   `db:"last_used_at"`
	RevokedAt                 sql.NullTime   `db:"revoked_at"`
	CreateTime                time.Time      `db:"create_time"`
	UpdateTime                time.Time      `db:"update_time"`
}

func toDomainOAuthGrant(rec *oauthGrantDB) *identity.OAuthGrant {
	return &identity.OAuthGrant{
		ID:                        identity.OAuthGrantID(rec.ID),
		ClientID:                  identity.OAuthClientID(rec.ClientID),
		UserID:                    identity.UserID(rec.UserID),
		SpaceID:                   rec.SpaceID,
		Scopes:                    []string(rec.Scopes),
		RefreshTokenHash:          rec.RefreshTokenHash.String,
		PreviousRefreshTokenHash:  rec.PreviousRefreshTokenHash.String,
		PreviousRefreshGraceUntil: nullTimeToTimePtr(rec.PreviousRefreshGraceUntil),
		RefreshExpiresAt:          nullTimeToTimePtr(rec.RefreshExpiresAt),
		LastUsedAt:                nullTimeToTimePtr(rec.LastUsedAt),
		RevokedAt:                 nullTimeToTimePtr(rec.RevokedAt),
		CreateTime:                rec.CreateTime,
		UpdateTime:                rec.UpdateTime,
	}
}

// OAuthGrantStore implements identity.OAuthGrantStore using PostgreSQL.
type OAuthGrantStore struct {
	db db.DB
}

// NewOAuthGrantStore creates a new OAuthGrantStore.
func NewOAuthGrantStore(database db.DB) *OAuthGrantStore {
	return &OAuthGrantStore{db: database}
}

// Create inserts a new OAuth grant record.
func (s *OAuthGrantStore) Create(ctx context.Context, grant *identity.OAuthGrant) error {
	const op errors.Op = "domain/identity/storage.CreateOAuthGrant"

	const query = `
		INSERT INTO identity.oauth_grants (
			id, client_id, user_id, space_id, scopes,
			refresh_token_hash, previous_refresh_token_hash, previous_refresh_grace_until,
			refresh_expires_at, last_used_at, revoked_at, create_time, update_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`

	if _, err := s.db.Exec(
		ctx,
		query,
		string(grant.ID),
		string(grant.ClientID),
		string(grant.UserID),
		grant.SpaceID,
		nonNilStringArray(grant.Scopes),
		strToNullString(grant.RefreshTokenHash),
		strToNullString(grant.PreviousRefreshTokenHash),
		timePtrToNullTime(grant.PreviousRefreshGraceUntil),
		timePtrToNullTime(grant.RefreshExpiresAt),
		timePtrToNullTime(grant.LastUsedAt),
		timePtrToNullTime(grant.RevokedAt),
		grant.CreateTime,
		grant.UpdateTime,
	); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetByID retrieves an OAuth grant by ID.
func (s *OAuthGrantStore) GetByID(ctx context.Context, id identity.OAuthGrantID) (*identity.OAuthGrant, error) {
	const op errors.Op = "domain/identity/storage.GetOAuthGrantByID"

	const query = `
		SELECT id, client_id, user_id, space_id, scopes,
		       refresh_token_hash, previous_refresh_token_hash, previous_refresh_grace_until,
		       refresh_expires_at, last_used_at, revoked_at, create_time, update_time
		FROM identity.oauth_grants
		WHERE id = $1
	`

	var rec oauthGrantDB
	if err := s.db.Get(ctx, &rec, query, string(id)); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainOAuthGrant(&rec), nil
}

// GetByRefreshTokenHash retrieves an OAuth grant matching either current or previous refresh token hash.
func (s *OAuthGrantStore) GetByRefreshTokenHash(ctx context.Context, tokenHash string) (*identity.OAuthGrant, error) {
	const op errors.Op = "domain/identity/storage.GetOAuthGrantByRefreshTokenHash"

	const query = `
		SELECT id, client_id, user_id, space_id, scopes,
		       refresh_token_hash, previous_refresh_token_hash, previous_refresh_grace_until,
		       refresh_expires_at, last_used_at, revoked_at, create_time, update_time
		FROM identity.oauth_grants
		WHERE refresh_token_hash = $1 OR previous_refresh_token_hash = $1
		LIMIT 1
	`

	var rec oauthGrantDB
	if err := s.db.Get(ctx, &rec, query, tokenHash); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainOAuthGrant(&rec), nil
}

// ListByUserID retrieves active grants for a user ordered newest first.
func (s *OAuthGrantStore) ListByUserID(ctx context.Context, userID identity.UserID) ([]*identity.OAuthGrant, error) {
	const op errors.Op = "domain/identity/storage.ListOAuthGrantsByUserID"

	const query = `
		SELECT id, client_id, user_id, space_id, scopes,
		       refresh_token_hash, previous_refresh_token_hash, previous_refresh_grace_until,
		       refresh_expires_at, last_used_at, revoked_at, create_time, update_time
		FROM identity.oauth_grants
		WHERE user_id = $1 AND revoked_at IS NULL
		ORDER BY create_time DESC
	`

	var recs []oauthGrantDB
	if err := s.db.Select(ctx, &recs, query, string(userID)); err != nil {
		return nil, errors.E(op, err)
	}

	grants := make([]*identity.OAuthGrant, len(recs))
	for i := range recs {
		grants[i] = toDomainOAuthGrant(&recs[i])
	}
	return grants, nil
}

// ListBySpaceID retrieves active grants for a workspace ordered newest first.
func (s *OAuthGrantStore) ListBySpaceID(ctx context.Context, spaceID string) ([]*identity.OAuthGrant, error) {
	const op errors.Op = "domain/identity/storage.ListOAuthGrantsBySpaceID"

	const query = `
		SELECT id, client_id, user_id, space_id, scopes,
		       refresh_token_hash, previous_refresh_token_hash, previous_refresh_grace_until,
		       refresh_expires_at, last_used_at, revoked_at, create_time, update_time
		FROM identity.oauth_grants
		WHERE space_id = $1 AND revoked_at IS NULL
		ORDER BY create_time DESC
	`

	var recs []oauthGrantDB
	if err := s.db.Select(ctx, &recs, query, spaceID); err != nil {
		return nil, errors.E(op, err)
	}

	grants := make([]*identity.OAuthGrant, len(recs))
	for i := range recs {
		grants[i] = toDomainOAuthGrant(&recs[i])
	}
	return grants, nil
}

// Update persists updated token hashes, scopes, and timestamps on an OAuth grant.
func (s *OAuthGrantStore) Update(ctx context.Context, grant *identity.OAuthGrant) error {
	const op errors.Op = "domain/identity/storage.UpdateOAuthGrant"

	const query = `
		UPDATE identity.oauth_grants
		SET scopes = $1,
		    refresh_token_hash = $2,
		    previous_refresh_token_hash = $3,
		    previous_refresh_grace_until = $4,
		    refresh_expires_at = $5,
		    last_used_at = $6,
		    update_time = $7
		WHERE id = $8 AND revoked_at IS NULL
	`

	if err := s.db.ExecOne(
		ctx,
		query,
		nonNilStringArray(grant.Scopes),
		strToNullString(grant.RefreshTokenHash),
		strToNullString(grant.PreviousRefreshTokenHash),
		timePtrToNullTime(grant.PreviousRefreshGraceUntil),
		timePtrToNullTime(grant.RefreshExpiresAt),
		timePtrToNullTime(grant.LastUsedAt),
		grant.UpdateTime,
		string(grant.ID),
	); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// Revoke marks an OAuth grant as revoked.
func (s *OAuthGrantStore) Revoke(ctx context.Context, id identity.OAuthGrantID, revokedAt time.Time) error {
	const op errors.Op = "domain/identity/storage.RevokeOAuthGrant"

	const query = `
		UPDATE identity.oauth_grants
		SET revoked_at = $1, update_time = $1
		WHERE id = $2 AND revoked_at IS NULL
	`

	if _, err := s.db.Exec(ctx, query, revokedAt, string(id)); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// TouchLastUsed updates the last_used_at timestamp on an OAuth grant.
func (s *OAuthGrantStore) TouchLastUsed(ctx context.Context, id identity.OAuthGrantID, lastUsedAt time.Time) error {
	const op errors.Op = "domain/identity/storage.TouchOAuthGrantLastUsed"

	const query = `UPDATE identity.oauth_grants SET last_used_at = $1 WHERE id = $2`
	if _, err := s.db.Exec(ctx, query, lastUsedAt, string(id)); err != nil {
		return errors.E(op, err)
	}
	return nil
}

type oauthAuthCodeDB struct {
	ID                  string         `db:"id"`
	CodeHash            sql.NullString `db:"code_hash"`
	HandoffHash         string         `db:"handoff_hash"`
	Approved            bool           `db:"approved"`
	ClientID            string         `db:"client_id"`
	UserID              string         `db:"user_id"`
	SpaceID             string         `db:"space_id"`
	RedirectURI         string         `db:"redirect_uri"`
	State               string         `db:"state"`
	Resource            string         `db:"resource"`
	Scopes              pq.StringArray `db:"scopes"`
	CodeChallenge       string         `db:"code_challenge"`
	CodeChallengeMethod string         `db:"code_challenge_method"`
	ExpiresAt           time.Time      `db:"expires_at"`
	ConsumedAt          sql.NullTime   `db:"consumed_at"`
	HandoffConsumedAt   sql.NullTime   `db:"handoff_consumed_at"`
	CreateTime          time.Time      `db:"create_time"`
}

func toDomainOAuthAuthCode(rec *oauthAuthCodeDB) *identity.OAuthAuthCode {
	return &identity.OAuthAuthCode{
		ID:                  identity.OAuthAuthCodeID(rec.ID),
		CodeHash:            rec.CodeHash.String,
		HandoffHash:         rec.HandoffHash,
		Approved:            rec.Approved,
		ClientID:            identity.OAuthClientID(rec.ClientID),
		UserID:              identity.UserID(rec.UserID),
		SpaceID:             rec.SpaceID,
		RedirectURI:         rec.RedirectURI,
		State:               rec.State,
		Resource:            rec.Resource,
		Scopes:              []string(rec.Scopes),
		CodeChallenge:       rec.CodeChallenge,
		CodeChallengeMethod: rec.CodeChallengeMethod,
		ExpiresAt:           rec.ExpiresAt,
		ConsumedAt:          nullTimeToTimePtr(rec.ConsumedAt),
		HandoffConsumedAt:   nullTimeToTimePtr(rec.HandoffConsumedAt),
		CreateTime:          rec.CreateTime,
	}
}

// OAuthAuthCodeStore implements identity.OAuthAuthCodeStore using PostgreSQL.
type OAuthAuthCodeStore struct {
	db db.DB
}

// NewOAuthAuthCodeStore creates a new OAuthAuthCodeStore.
func NewOAuthAuthCodeStore(database db.DB) *OAuthAuthCodeStore {
	return &OAuthAuthCodeStore{db: database}
}

// Create inserts a new OAuth authorization code / handoff record.
func (s *OAuthAuthCodeStore) Create(ctx context.Context, code *identity.OAuthAuthCode) error {
	const op errors.Op = "domain/identity/storage.CreateOAuthAuthCode"

	const query = `
		INSERT INTO identity.oauth_auth_codes (
			id, code_hash, handoff_hash, approved, client_id, user_id, space_id,
			redirect_uri, state, resource, scopes, code_challenge, code_challenge_method,
			expires_at, consumed_at, handoff_consumed_at, create_time
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
	`

	if _, err := s.db.Exec(
		ctx,
		query,
		string(code.ID),
		strToNullString(code.CodeHash),
		code.HandoffHash,
		code.Approved,
		string(code.ClientID),
		string(code.UserID),
		code.SpaceID,
		code.RedirectURI,
		code.State,
		code.Resource,
		nonNilStringArray(code.Scopes),
		code.CodeChallenge,
		code.CodeChallengeMethod,
		code.ExpiresAt,
		timePtrToNullTime(code.ConsumedAt),
		timePtrToNullTime(code.HandoffConsumedAt),
		code.CreateTime,
	); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// ConsumeHandoff atomically consumes a handoff nonce and assigns code_hash + expiry when approved.
func (s *OAuthAuthCodeStore) ConsumeHandoff(ctx context.Context, handoffHash, newCodeHash string, codeExpiresAt, now time.Time) (*identity.OAuthAuthCode, error) {
	const op errors.Op = "domain/identity/storage.ConsumeOAuthHandoff"

	const query = `
		UPDATE identity.oauth_auth_codes
		SET handoff_consumed_at = $2,
		    code_hash = CASE WHEN approved THEN $3 ELSE NULL END,
		    expires_at = CASE WHEN approved THEN $4 ELSE expires_at END
		WHERE handoff_hash = $1
		  AND handoff_consumed_at IS NULL
		  AND expires_at > $2
		RETURNING id, code_hash, handoff_hash, approved, client_id, user_id, space_id,
		          redirect_uri, state, resource, scopes, code_challenge, code_challenge_method,
		          expires_at, consumed_at, handoff_consumed_at, create_time
	`

	var rec oauthAuthCodeDB
	if err := s.db.Get(ctx, &rec, query, handoffHash, now, strToNullString(newCodeHash), codeExpiresAt); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainOAuthAuthCode(&rec), nil
}

// GetByCodeHash retrieves an authorization code record by its SHA-256 hex digest.
func (s *OAuthAuthCodeStore) GetByCodeHash(ctx context.Context, codeHash string) (*identity.OAuthAuthCode, error) {
	const op errors.Op = "domain/identity/storage.GetOAuthAuthCodeByCodeHash"

	const query = `
		SELECT id, code_hash, handoff_hash, approved, client_id, user_id, space_id,
		       redirect_uri, state, resource, scopes, code_challenge, code_challenge_method,
		       expires_at, consumed_at, handoff_consumed_at, create_time
		FROM identity.oauth_auth_codes
		WHERE code_hash = $1
	`

	var rec oauthAuthCodeDB
	if err := s.db.Get(ctx, &rec, query, codeHash); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainOAuthAuthCode(&rec), nil
}

// MarkConsumed atomically marks an unconsumed authorization code as consumed.
func (s *OAuthAuthCodeStore) MarkConsumed(ctx context.Context, id identity.OAuthAuthCodeID, consumedAt time.Time) error {
	const op errors.Op = "domain/identity/storage.MarkOAuthAuthCodeConsumed"

	const query = `
		UPDATE identity.oauth_auth_codes
		SET consumed_at = $1
		WHERE id = $2 AND consumed_at IS NULL
	`

	if err := s.db.ExecOne(ctx, query, consumedAt, string(id)); err != nil {
		return errors.E(op, err)
	}
	return nil
}

type oauthAccessTokenDB struct {
	ID         string       `db:"id"`
	GrantID    string       `db:"grant_id"`
	TokenHash  string       `db:"token_hash"`
	ExpiresAt  time.Time    `db:"expires_at"`
	RevokedAt  sql.NullTime `db:"revoked_at"`
	CreateTime time.Time    `db:"create_time"`
}

func toDomainOAuthAccessToken(rec *oauthAccessTokenDB) *identity.OAuthAccessToken {
	return &identity.OAuthAccessToken{
		ID:         identity.OAuthAccessTokenID(rec.ID),
		GrantID:    identity.OAuthGrantID(rec.GrantID),
		TokenHash:  rec.TokenHash,
		ExpiresAt:  rec.ExpiresAt,
		RevokedAt:  nullTimeToTimePtr(rec.RevokedAt),
		CreateTime: rec.CreateTime,
	}
}

// OAuthAccessTokenStore implements identity.OAuthAccessTokenStore using PostgreSQL.
type OAuthAccessTokenStore struct {
	db db.DB
}

// NewOAuthAccessTokenStore creates a new OAuthAccessTokenStore.
func NewOAuthAccessTokenStore(database db.DB) *OAuthAccessTokenStore {
	return &OAuthAccessTokenStore{db: database}
}

// Create inserts a new OAuth access token record.
func (s *OAuthAccessTokenStore) Create(ctx context.Context, tok *identity.OAuthAccessToken) error {
	const op errors.Op = "domain/identity/storage.CreateOAuthAccessToken"

	const query = `
		INSERT INTO identity.oauth_access_tokens (
			id, grant_id, token_hash, expires_at, revoked_at, create_time
		) VALUES ($1, $2, $3, $4, $5, $6)
	`

	if _, err := s.db.Exec(
		ctx,
		query,
		string(tok.ID),
		string(tok.GrantID),
		tok.TokenHash,
		tok.ExpiresAt,
		timePtrToNullTime(tok.RevokedAt),
		tok.CreateTime,
	); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetByHash retrieves an OAuth access token by its SHA-256 hex digest.
func (s *OAuthAccessTokenStore) GetByHash(ctx context.Context, tokenHash string) (*identity.OAuthAccessToken, error) {
	const op errors.Op = "domain/identity/storage.GetOAuthAccessTokenByHash"

	const query = `
		SELECT id, grant_id, token_hash, expires_at, revoked_at, create_time
		FROM identity.oauth_access_tokens
		WHERE token_hash = $1
	`

	var rec oauthAccessTokenDB
	if err := s.db.Get(ctx, &rec, query, tokenHash); err != nil {
		return nil, errors.E(op, err)
	}
	return toDomainOAuthAccessToken(&rec), nil
}

// RevokeByTokenHash marks an access token as revoked by its hash.
func (s *OAuthAccessTokenStore) RevokeByTokenHash(ctx context.Context, tokenHash string, revokedAt time.Time) error {
	const op errors.Op = "domain/identity/storage.RevokeOAuthAccessTokenByHash"

	const query = `
		UPDATE identity.oauth_access_tokens
		SET revoked_at = $1
		WHERE token_hash = $2 AND revoked_at IS NULL
	`

	if _, err := s.db.Exec(ctx, query, revokedAt, tokenHash); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// RevokeByGrantID marks all access tokens associated with grantID as revoked.
func (s *OAuthAccessTokenStore) RevokeByGrantID(ctx context.Context, grantID identity.OAuthGrantID, revokedAt time.Time) error {
	const op errors.Op = "domain/identity/storage.RevokeOAuthAccessTokensByGrantID"

	const query = `
		UPDATE identity.oauth_access_tokens
		SET revoked_at = $1
		WHERE grant_id = $2 AND revoked_at IS NULL
	`

	if _, err := s.db.Exec(ctx, query, revokedAt, string(grantID)); err != nil {
		return errors.E(op, err)
	}
	return nil
}
