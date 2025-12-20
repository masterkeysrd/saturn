----------------------------------------------
-- SQL Queries for Space Management
----------------------------------------------
-- name: ListSpacesBySpaceIDs
-- return: many
-- return_type: SpaceEntity
SELECT
  id,
  owner_id,
  name,
  alias,
  description,
  create_by,
  create_time,
  update_by,
  update_time
FROM
  tenancy.spaces
WHERE
  id = ANY (:space_ids);

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
-- name: ListMembershipsByUserID
-- return: many
-- return_type: MembershipEntity
SELECT
  space_id,
  user_id,
  role,
  join_time,
  create_by,
  create_time,
  update_by,
  update_time
FROM
  tenancy.memberships
WHERE
  user_id =:user_id;

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
