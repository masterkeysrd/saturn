export interface Expense {
  id?: string;
  budget?: {
    id?: string;
    description?: string;
  };
  description?: string;
  type?: ExpenseType;
  amount?: number;
}

export type ExpenseType = "fixed" | "variable" | "unknown";
