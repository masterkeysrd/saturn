import axios from "axios";
import { type Insights } from "./Finance.model";
import { URLQuery } from "@/lib/query";

export interface GetInsightsRequest {
  start_date: string;
  end_date: string;
}

const baseUrl = "http://localhost:3000/api/v1/finance";

export async function deleteTransaction(id: string): Promise<void> {
  await axios.delete(`${baseUrl}/transactions/${id}`);
}

export async function getInsights(req: GetInsightsRequest) {
  const query = URLQuery.build(req);
  return axios
    .get<Insights>(`${baseUrl}/insights${query.toQuery()}`)
    .then((resp) => resp.data);
}
