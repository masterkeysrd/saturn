export interface Expense {
  id?: string;
  budget?: {
    id?: string;
    description?: string;
  };
  category?: {
    id?: string;
    name?: string;
  };
  description?: string;
  type?: ExpenseType;
  billingDay?: number;
  amount?: number;
}

export type ExpenseType = "fixed" | "variable" | "unknown";
