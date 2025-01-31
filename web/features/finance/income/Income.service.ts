import axios from "axios";
import { Income } from "./Income.model";

const baseUrl = "http://localhost:3000/incomes";

export async function getIncomes(): Promise<Income[]> {
  const response = await axios.get<Income[]>(baseUrl);
  return response.data;
}

export async function getIncome(id: string) {
  const response = await axios.get<Income>(`${baseUrl}/${id}`);
  return response.data;
}

export async function createIncome(income: Income) {
  const response = await axios.post<Income>(baseUrl, income);
  return response.data;
}

export async function updateIncome(income: Income) {
  const response = await axios.put<Income>(`${baseUrl}/${income.id}`, income);
  return response.data;
}

export async function deleteIncome(id: string) {
  const response = await axios.delete<Income>(`${baseUrl}/${id}`);
  return response.data;
}
