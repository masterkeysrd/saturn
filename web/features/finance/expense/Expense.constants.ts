import { ExpenseType } from "./Expense.model";

export const ExpenseTypesMap: Record<ExpenseType, string> = {
  unknown: "Unknown",
  fixed: "Fixed",
  variable: "Variable",
};

export const ExpenseTypesList: { label: string; value: ExpenseType }[] =
  Object.entries(ExpenseTypesMap).map(([key, value]) => ({
    label: value,
    value: key as ExpenseType,
  }));
