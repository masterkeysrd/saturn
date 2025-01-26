import axios from "axios";
import { Expense } from "./Expense.model";

const baseUrl = "http://localhost:3000/expenses";

export async function getExpenses(): Promise<Expense[]> {
  const response = await axios.get<Expense[]>(baseUrl);
  return response.data;
}

export async function getExpense(id: string): Promise<Expense> {
  const response = await axios.get<Expense>(`${baseUrl}/${id}`);
  return response.data;
}

export async function createExpense(expense: Expense): Promise<Expense> {
  const response = await axios.post<Expense>(baseUrl, expense);
  return response.data;
}

export async function updateExpense(expense: Expense): Promise<Expense> {
  const response = await axios.put<Expense>(
    `${baseUrl}/${expense.id}`,
    expense,
  );
  return response.data;
}
