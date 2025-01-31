export interface Category {
  id?: string;
  name?: string;
  type?: CategoryType;
}

export type CategoryType = "expense" | "income";
