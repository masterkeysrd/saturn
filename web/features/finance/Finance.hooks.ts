import { useQuery } from "@tanstack/react-query";
import { getInsights, type GetInsightsRequest } from "./Finance.api";

const queryKeys = {
    getInsights: (req: GetInsightsRequest) => [
        "insights", 
        "start_date", req.start_date, 
        "end_date", req.end_date,
    ]
};

export const useInsights = (req: GetInsightsRequest) => {
  return useQuery({
    queryKey: queryKeys.getInsights(req),
    queryFn: () => getInsights(req),
  });
};
