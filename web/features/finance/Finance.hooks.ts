import { useQuery } from "@tanstack/react-query";
import { getInsights, listTransactions, type GetInsightsRequest } from "./Finance.api";

const queryKeys = {
    listTransactions: ["transactions", "list"],
    getInsights: (req: GetInsightsRequest) => [
        "insights",
        "start_date", req.start_date,
        "end_date", req.end_date,
    ]
};

export const useTransactions = () => {
    return useQuery({
        queryKey: queryKeys.listTransactions,
        queryFn: listTransactions,
    })
}

export const useInsights = (req: GetInsightsRequest) => {
    return useQuery({
        queryKey: queryKeys.getInsights(req),
        queryFn: () => getInsights(req),
    });
};
