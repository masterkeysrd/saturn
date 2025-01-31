import { ExpenseTypesMap } from "./Expense.constants";
import { ExpenseType } from "./Expense.model";

export const getExpenseTypeLabel = (type: ExpenseType | undefined) =>
  ExpenseTypesMap[type ?? "unknown"];
