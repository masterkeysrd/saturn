#!/bin/bash
# This script is used to create the dynamodb tables for saturn
echo "=> Creating tables for saturn"

if [ -z "$DYNAMODB_ENDPOINT" ]; then
  echo "=> DYNAMODB_ENDPOINT is not set, using default value of http://dynamodb:8000"
  DYNAMODB_ENDPOINT="http://dynamodb:8000"
fi

dynamodb_cmd="aws dynamodb"
dynamodb_flags="--endpoint-url $DYNAMODB_ENDPOINT"
cat /init/tables/expense.json

check_if_table_exists() {
  table_name=$1
  table_description=$($dynamodb_cmd describe-table --table-name $table_name $dynamodb_flags 2>&1)
  if [ $? -eq 0 ]; then
    return 0
  else
    return 1
  fi
}

create_expense_table() {
  if check_if_table_exists "local-saturn-expense"; then
    echo "Table expense already exists"
  else
    echo "Creating table expense"
    $dynamodb_cmd create-table \
      --cli-input-json file://\/init/tables/expenses.json \
      $dynamodb_flags
  fi
}

echo "=> Creating tables for saturn"
create_expense_table
