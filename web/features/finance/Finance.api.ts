import axios from "axios";
import type { Insights } from "./Finance.model";

export interface GetInsightsRequest {
    start_date: string;
    end_date: string;
}

const baseUrl = 'http://localhost:3000/api/v1/finance';

export async function getInsights(req: GetInsightsRequest) {
    const params = new URLSearchParams();
    params.append('start_date', req.start_date);
    params.append('end_date', req.end_date);
    return axios
        .get<Insights>(`${baseUrl}/insights?${params.toString()}`)
        .then(resp => resp.data);
}
