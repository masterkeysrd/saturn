----------------------------------------------
-- SQL Queries for User Management
----------------------------------------------
-- name: GetUserByID
SELECT
  id,
  name,
  avatar_url,
  username,
  email,
  role,
  status,
  create_time,
  update_time,
  delete_time
FROM
  identity.users
WHERE
  id =:id;

-- name: UpsertUser
-- param_type: UserEntity
INSERT INTO
  identity.users (
    id,
    name,
    avatar_url,
    username,
    email,
    role,
    status,
    create_time,
    update_time,
    delete_time
  )
VALUES
  (
:id,
:name,
:avatar_url,
:username,
:email,
:role,
:status,
:create_time,
:update_time,
:delete_time
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  avatar_url = EXCLUDED.avatar_url,
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  update_time = EXCLUDED.update_time,
  delete_time = EXCLUDED.delete_time;

-- name: ExistsUserByUsername
SELECT
  EXISTS (
    SELECT
      1
    FROM
      identity.users
    WHERE
      username =:username
  );

-- name: ExistsUserByEmail
SELECT
  EXISTS (
    SELECT
      1
    FROM
      identity.users
    WHERE
      email =:email
  );

----------------------------------------------
-- SQL Queries for Session Management
----------------------------------------------
-- name: GetSessionByID
SELECT
  id,
  user_id,
  token_hash,
  user_agent,
  client_ip,
  expires_at,
  create_time,
  update_time
FROM
  identity.sessions
WHERE
  id =:id;

-- name: UpsertSession
-- param_type: SessionEntity
INSERT INTO
  identity.sessions (
    id,
    user_id,
    token_hash,
    user_agent,
    client_ip,
    expires_at,
    create_time,
    update_time
  )
VALUES
  (
:id,
:user_id,
:token_hash,
:user_agent,
:client_ip,
:expires_at,
:create_time,
:update_time
  )
ON CONFLICT (id) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  token_hash = EXCLUDED.token_hash,
  user_agent = EXCLUDED.user_agent,
  client_ip = EXCLUDED.client_ip,
  expires_at = EXCLUDED.expires_at,
  update_time = EXCLUDED.update_time;

-- name: DeleteSessionByID
DELETE FROM identity.sessions
WHERE
  id =:id;

-- name: DeleteSessionsByUserID
DELETE FROM identity.sessions
WHERE
  user_id =:user_id;

----------------------------------------------
-- SQL Queries for Binding Management
----------------------------------------------
-- name: GetBindingByID
SELECT
  user_id,
  provider,
  subject_id,
  create_time,
  update_time
FROM
  identity.bindings
WHERE
  user_id =:user_id
  AND provider =:provider;

-- name: ListBindingsByUserID
SELECT
  user_id,
  provider,
  subject_id,
  create_time,
  update_time
FROM
  identity.bindings
WHERE
  user_id =:user_id
ORDER BY
  provider ASC;

-- name: UpsertBinding
-- param_type: BindingEntity
INSERT INTO
  identity.bindings (
    user_id,
    provider,
    subject_id,
    create_time,
    update_time
  )
VALUES
  (
:user_id,
:provider,
:subject_id,
:create_time,
:update_time
  )
ON CONFLICT (user_id, provider) DO UPDATE
SET
  subject_id = EXCLUDED.subject_id,
  update_time = EXCLUDED.update_time;

-- name: DeleteBinding
DELETE FROM identity.bindings
WHERE
  user_id =:user_id
  AND provider =:provider;

----------------------------------------------
-- SQL Queries for Vault Credentials Management
----------------------------------------------
-- name: GetCredentialsBySubjectID
SELECT
  subject_id,
  username,
  email,
  password_hash,
  create_time,
  update_time
FROM
  identity.vault_credentials
WHERE
  subject_id =:subject_id;

-- name: GetCredentialsByIdentifier
SELECT
  subject_id,
  username,
  email,
  password_hash,
  create_time,
  update_time
FROM
  identity.vault_credentials
WHERE
  username =:identifier
  OR email =:identifier;

-- name: ExistsCredentialsByUsername
SELECT
  EXISTS (
    SELECT
      1
    FROM
      identity.vault_credentials
    WHERE
      username =:username
  );

-- name: ExistsCredentialsByEmail
SELECT
  EXISTS (
    SELECT
      1
    FROM
      identity.vault_credentials
    WHERE
      email =:email
  );

-- name: UpsertCredentials
-- param_type: VaultCredentialEntity
INSERT INTO
  identity.vault_credentials (
    subject_id,
    username,
    email,
    password_hash,
    create_time,
    update_time
  )
VALUES
  (
:subject_id,
:username,
:email,
:password_hash,
:create_time,
:update_time
  )
ON CONFLICT (subject_id) DO UPDATE
SET
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  update_time = EXCLUDED.update_time;
