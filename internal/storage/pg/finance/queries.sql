----------------------------------------------------
-- SQL Queries for Budgets Management
----------------------------------------------
-- name: GetBudgetByID
-- return: one
-- return_type: BudgetEntity
SELECT
  id,
  space_id,
  name,
  description,
  color,
  icon_name,
  amount_currency,
  amount_cents,
  create_time,
  create_by,
  update_time,
  update_by
FROM
  finance.budgets
WHERE
  id =:id
  AND space_id =:space_id
LIMIT
  1;

-- name: ListBudgets
-- return: many
-- return_type: BudgetEntity
SELECT
  id,
  space_id,
  name,
  description,
  color,
  icon_name,
  amount_currency,
  amount_cents,
  create_time,
  create_by,
  update_time,
  update_by
FROM
  finance.budgets
WHERE
  space_id =:space_id
ORDER BY
  create_time DESC;

-- name: UpsertBudget
-- return: one
-- param_type: BudgetEntity
-- return_type: BudgetEntity
INSERT INTO
  finance.budgets (
    id,
    space_id,
    name,
    description,
    color,
    icon_name,
    amount_currency,
    amount_cents,
    create_time,
    create_by,
    update_time,
    update_by
  )
VALUES
  (
:id,
:space_id,
:name,
:description,
:color,
:icon_name,
:amount_currency,
:amount_cents,
:create_time,
:create_by,
:update_time,
:update_by
  )
ON CONFLICT (id, space_id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon_name = EXCLUDED.icon_name,
  update_time = EXCLUDED.update_time,
  update_by = EXCLUDED.update_by
RETURNING
  id,
  space_id,
  name,
  description,
  color,
  icon_name,
  amount_currency,
  amount_cents,
  create_time,
  create_by,
  update_time,
  update_by;

-- name: DeleteBudgetByID
-- return: exec
DELETE FROM finance.budgets
WHERE
  id =:id
  AND space_id =:space_id;
