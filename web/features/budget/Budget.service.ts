import axios from "axios";
import { Budget } from "./Budget.model";

const baseUrl = "http://localhost:3000/budgets";

export async function getBudgets(): Promise<Budget[]> {
  const response = await axios.get<Budget[]>(baseUrl);
  return response.data;
}

export async function getBudget(id: string): Promise<Budget> {
  const response = await axios.get<Budget>(`${baseUrl}/${id}`);
  return response.data;
}

export async function createBudget(budget: Budget): Promise<Budget> {
  const response = await axios.post<Budget>(baseUrl, budget);
  return response.data;
}

export async function updateBudget(budget: Budget): Promise<Budget> {
  const response = await axios.put<Budget>(`${baseUrl}/${budget.id}`, budget);
  return response.data;
}
