#!/bin/bash
# This script is used to create the dynamodb tables for saturn
echo "=> Creating tables for saturn"

if [ -z "$DYNAMODB_ENDPOINT" ]; then
  echo "=> DYNAMODB_ENDPOINT is not set, using default value of http://dynamodb:8000"
  DYNAMODB_ENDPOINT="http://dynamodb:8000"
fi

dynamodb_cmd="aws dynamodb"
dynamodb_flags="--endpoint-url $DYNAMODB_ENDPOINT"

check_if_table_exists() {
  table_name=$1
  table_description=$($dynamodb_cmd describe-table --table-name $table_name $dynamodb_flags 2>&1)
  if [ $? -eq 0 ]; then
    return 0
  else
    return 1
  fi
}

create_budget_table() {
  if check_if_table_exists "local-saturn-budgets"; then
    echo "Table budget already exists"
  else
    echo "Creating table budget"
    $dynamodb_cmd create-table \
      --cli-input-json file://\/init/tables/budget.json \
      $dynamodb_flags
  fi
}

create_expense_table() {
  if check_if_table_exists "local-saturn-expenses"; then
    echo "Table expense already exists"
  else
    echo "Creating table expense"
    $dynamodb_cmd create-table \
      --cli-input-json file://\/init/tables/expense.json \
      $dynamodb_flags
  fi
}

create_income_table() {
  if check_if_table_exists "local-saturn-incomes"; then
    echo "Table income already exists"
  else
    echo "Creating table income"
    $dynamodb_cmd create-table \
      --cli-input-json file://\/init/tables/income.json \
      $dynamodb_flags
  fi
}

echo "=> Creating tables for saturn"
create_budget_table
create_expense_table
create_income_table
