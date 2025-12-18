----------------------------------------------
-- SQL Queries for Space Management
----------------------------------------------
-- name: UpsertSpace
-- return: exec
-- param_type: SpaceEntity
INSERT INTO
  tenancy.spaces (
    id,
    owner_id,
    name,
    alias,
    description,
    create_by,
    create_time,
    update_by,
    update_time
  )
VALUES
  (
:id,
:owner_id,
:name,
:alias,
:description,
:create_by,
:create_time,
:update_by,
:update_time
  )
ON CONFLICT (id) DO UPDATE
SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name,
  alias = EXCLUDED.alias,
  description = EXCLUDED.description,
  update_by = EXCLUDED.update_by,
  update_time = EXCLUDED.update_time;

----------------------------------------------
-- SQL Queries for Membership Management
----------------------------------------------
-- name: UpsertMembership
-- param_type: MembershipEntity
INSERT INTO
  tenancy.memberships (
    space_id,
    user_id,
    role,
    join_time,
    create_by,
    create_time,
    update_by,
    update_time
  )
VALUES
  (
:space_id,
:user_id,
:role,
:join_time,
:create_by,
:create_time,
:update_by,
:update_time
  )
ON CONFLICT (space_id, user_id) DO UPDATE
SET ROLE = EXCLUDED.role,
join_time = EXCLUDED.join_time,
update_by = EXCLUDED.update_by,
update_time = EXCLUDED.update_time;
