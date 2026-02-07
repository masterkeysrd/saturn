import axios from "axios";
import {
  type Insights,
  type Transaction,
  type Expense,
  type Currency,
  type UpdateExpenseParams,
} from "./Finance.model";
import { URLQuery } from "@/lib/query";

export interface GetInsightsRequest {
  start_date: string;
  end_date: string;
}

const baseUrl = "http://localhost:3000/api/v1/finance";

export async function getCurrency(currencyCode: string) {
  return axios
    .get<Currency>(`${baseUrl}/currencies/${currencyCode}`)
    .then((resp) => resp.data);
}

export async function createExpense(data: Expense) {
  return axios
    .post<Transaction>(`${baseUrl}/expenses`, data)
    .then((resp) => resp.data);
}

export async function updateExpense(
  id: string,
  data: Expense,
  params: UpdateExpenseParams = {},
) {
  const query = URLQuery.build(params);
  return axios
    .patch<Transaction>(`${baseUrl}/expenses/${id}${query.toQuery()}`, data)
    .then((resp) => resp.data);
}

export async function getTransaction(id: string) {
  return axios
    .get<Transaction>(`${baseUrl}/transactions/${id}`)
    .then((resp) => resp.data);
}

export async function deleteTransaction(id: string): Promise<void> {
  await axios.delete(`${baseUrl}/transactions/${id}`);
}

export async function getInsights(req: GetInsightsRequest) {
  const query = URLQuery.build(req);
  return axios
    .get<Insights>(`${baseUrl}/insights${query.toQuery()}`)
    .then((resp) => resp.data);
}
