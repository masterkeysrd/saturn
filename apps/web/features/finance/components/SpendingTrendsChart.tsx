import { useMemo } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { BarChart } from "@mui/x-charts/BarChart";
import { money } from "@/lib/money";
import type { SpendingInsights } from "../Finance.model";

const STACK_GROUP = "total";

export interface SpendingTrendsChartProps {
  isLoading: boolean;
  insights?: SpendingInsights;
}

function getUsageColor(usage: number): "success" | "warning" | "error" {
  if (usage < 70) return "success";
  if (usage < 90) return "warning";
  return "error";
}

export default function SpendingTrendsChart({
  isLoading,
  insights,
}: SpendingTrendsChartProps) {
  const sortedTrends = useMemo(() => {
    if (!insights) {
      return [];
    }
    return insights.trends.sort((a, b) => a.period.localeCompare(b.period));
  }, [insights]);

  const periods = useMemo(() => {
    if (isLoading) {
      return [];
    }
    return sortedTrends.map((trend) => trend.period);
  }, [isLoading, sortedTrends]);

  const budgetsSeries = useMemo(() => {
    if (!insights) {
      return [];
    }

    return insights.by_budget.map((budget) => {
      const data = sortedTrends.map((trend) => {
        const trendBudget = trend.budgets.find(
          (b) => b.budget_id === budget.budget_id,
        );
        return trendBudget ? money.toDecimalFromMoney(trendBudget.spent) : 0;
      });

      return {
        id: budget.budget_id,
        label: budget.budget_name,
        data,
        stack: STACK_GROUP,
      };
    });
  }, [insights, sortedTrends]);

  if (isLoading || !insights) {
    return <Skeleton variant="rectangular" height={300} />;
  }

  return (
    <Card variant="outlined" sx={{ width: "100%" }}>
      <CardContent>
        <Typography component="h2" variant="subtitle2" gutterBottom>
          Spending trends
        </Typography>
        <Stack sx={{ justifyContent: "space-between" }}>
          <Stack
            direction="row"
            sx={{
              alignContent: { xs: "center", sm: "flex-start" },
              alignItems: "center",
              gap: 1,
            }}
          >
            <Typography variant="h4" component="p">
              {money.format(insights.summary.spent ?? money.zero())}
            </Typography>
            <Chip
              size="small"
              label={`${(insights.summary.usage ?? 0).toFixed(2)}%`}
              color={getUsageColor(insights.summary?.usage ?? 0)}
            />
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Spending for the last six monthds
          </Typography>
        </Stack>
        <BarChart
          borderRadius={8}
          xAxis={[
            {
              scaleType: "band",
              categoryGapRatio: 0.5,
              data: periods,
              height: 24,
            },
          ]}
          yAxis={[{ width: 50 }]}
          series={[...budgetsSeries]}
          height={250}
          margin={{ left: 0, right: 0, top: 20, bottom: 0 }}
          grid={{ horizontal: true }}
          hideLegend
        />
      </CardContent>
    </Card>
  );
}
