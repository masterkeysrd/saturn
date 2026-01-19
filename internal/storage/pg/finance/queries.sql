----------------------------------------------------
-- SQL Schema for Settings Management
----------------------------------------------------
-- name: GetSettingsBySpaceID
-- return: one
-- return_type: SettingEntity
SELECT
  space_id,
  status,
  base_currency,
  create_time,
  create_by,
  update_time,
  update_by
FROM
  finance.settings
WHERE
  space_id =:space_id
LIMIT
  1;

-- name: UpsertSettings
-- return: one
-- param_type: SettingEntity
-- return_type: SettingEntity
INSERT INTO
  finance.settings (
    space_id,
    status,
    base_currency,
    create_time,
    create_by,
    update_time,
    update_by
  )
VALUES
  (
:space_id,
:status,
:base_currency,
:create_time,
:create_by,
:update_time,
:update_by
  )
ON CONFLICT (space_id) DO UPDATE
SET
  status = EXCLUDED.status,
  base_currency = EXCLUDED.base_currency,
  update_time = EXCLUDED.update_time,
  update_by = EXCLUDED.update_by
RETURNING
  space_id,
  status,
  base_currency,
  create_time,
  create_by,
  update_time,
  update_by;

----------------------------------------------------
-- SQL Queries for Budgets Management
----------------------------------------------------
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

----------------------------------------------------
-- SQL Queries for Exchange Rates Management
----------------------------------------------------
-- name: GetExchangeRate
-- return: one
-- return_type: ExchangeRateEntity
SELECT
  space_id,
  currency_code,
  rate,
  is_base,
  create_time,
  create_by,
  update_time,
  update_by
FROM
  finance.exchange_rates
WHERE
  space_id =:space_id
  AND currency_code =:currency_code
LIMIT
  1;

-- name: ExistsExchangeRate
-- return: one
-- return_type: bool
SELECT
  EXISTS (
    SELECT
      1
    FROM
      finance.exchange_rates
    WHERE
      space_id =:space_id
      AND currency_code =:currency_code
  ) AS EXISTS;

-- name: ListExchangeRatesBySpaceID
-- return: many
-- return_type: ExchangeRateEntity
SELECT
  space_id,
  currency_code,
  rate,
  is_base,
  create_time,
  create_by,
  update_time,
  update_by
FROM
  finance.exchange_rates
WHERE
  space_id =:space_id;

-- name: UpsertExchangeRate
-- return: one
-- param_type: ExchangeRateEntity
-- return_type: ExchangeRateEntity
INSERT INTO
  finance.exchange_rates (
    space_id,
    currency_code,
    rate,
    is_base,
    create_time,
    create_by,
    update_time,
    update_by
  )
VALUES
  (
:space_id,
:currency_code,
:rate,
:is_base,
:create_time,
:create_by,
:update_time,
:update_by
  )
ON CONFLICT (space_id, currency_code) DO UPDATE
SET
  rate = EXCLUDED.rate,
  is_base = EXCLUDED.is_base,
  update_time = EXCLUDED.update_time,
  update_by = EXCLUDED.update_by
RETURNING
  space_id,
  currency_code,
  rate,
  is_base,
  create_time,
  create_by,
  update_time,
  update_by;

-- name: DeleteExchangeRate
-- return: exec
DELETE FROM finance.exchange_rates
WHERE
  space_id =:space_id
  AND currency_code =:currency_code;
