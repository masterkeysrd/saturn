import axios from "axios";
import {
  type ListTransactionsResponse,
  type Insights,
  type ListBudgetsResponse,
  type Budget,
  type Transaction,
  type Expense,
  type Currency,
  type ListCurrenciesResponse,
  type UpdateBudgetParams,
  type UpdateExpenseParams,
  type ListBudgetParams,
} from "./Finance.model";
import { URLQuery } from "@/lib/query";

export interface GetInsightsRequest {
  start_date: string;
  end_date: string;
}

const baseUrl = "http://localhost:3000/api/v1/finance";

export async function listBudgets(params: ListBudgetParams) {
  const query = URLQuery.build(params);
  return axios
    .get<ListBudgetsResponse>(`${baseUrl}/budgets${query.toQuery()}`)
    .then((resp) => resp.data);
}

export async function getBudget(id: string) {
  return axios
    .get<Budget>(`${baseUrl}/budgets/${id}`)
    .then((resp) => resp.data);
}

export async function createBudget(data: Budget) {
  return axios
    .post<Transaction>(`${baseUrl}/budgets`, data)
    .then((resp) => resp.data);
}

export async function updateBudget(
  id: string,
  data: Budget,
  params: UpdateBudgetParams = {},
) {
  const query = URLQuery.build(params);
  return axios
    .patch<Transaction>(`${baseUrl}/budgets/${id}${query.toQuery()}`, data)
    .then((resp) => resp.data);
}

export async function deleteBudget(id: string): Promise<void> {
  await axios
    .delete<Budget>(`${baseUrl}/budgets/${id}`)
    .then((resp) => resp.data);
}

export async function getCurrency(currencyCode: string) {
  return axios
    .get<Currency>(`${baseUrl}/currencies/${currencyCode}`)
    .then((resp) => resp.data);
}

export async function getCurrencies() {
  return axios
    .get<ListCurrenciesResponse>(`${baseUrl}/currencies`)
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

export async function listTransactions() {
  return axios
    .get<ListTransactionsResponse>(`${baseUrl}/transactions`)
    .then((resp) => resp.data);
}

export async function getInsights(req: GetInsightsRequest) {
  const query = URLQuery.build(req);
  return axios
    .get<Insights>(`${baseUrl}/insights${query.toQuery()}`)
    .then((resp) => resp.data);
}
