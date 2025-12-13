import { Grid } from "@mui/material";
import Page from "@/components/Page";
import { useInsights } from "../Finance.hooks";
import SpentSummaryCard from "../components/SpentSummaryCard";
import SpentBreakdownChart from "../components/SpentBreakdownChart";
import SpendingTrendsChart from "../components/SpendingTrendsChart";
import PageHeader from "@/components/PageHeader";
import PageContent from "@/components/PageContent";
import { DateTime } from "luxon";

export default function InsightsPage() {
  // Calculate dynamic date ranges using Luxon
  const now = DateTime.now();

  // Current Month range (e.g., Nov 1 to Nov 30)
  const currentStart = now.startOf("month").toISODate();
  const currentEnd = now.endOf("month").toISODate();

  // Historical range (Start of Year to End of Current Month)
  const lastSixMonths = now.minus({ month: 6 }).toISODate();

  const { data: current, isLoading: isLoadingCurrent } = useInsights({
    start_date: currentStart,
    end_date: currentEnd,
  });

  const { data: historical, isLoading: isLoadingHistorical } = useInsights({
    start_date: lastSixMonths,
    end_date: currentEnd,
  });

  if (isLoadingCurrent || !current) {
    return;
  }

  return (
    <Page>
      <PageHeader
        title="Insights"
        subtitle="Get a clearer picture of your financial life."
      />
      <PageContent>
        <Grid container spacing={2} columns={12}>
          <Grid size={{ sm: 12, md: 6 }}>
            <SpentSummaryCard summary={current.spending.summary} />
          </Grid>
          <Grid size={{ sm: 12, md: 6 }}>
            <SpentBreakdownChart
              summary={current.spending.summary}
              budgets={current.spending.by_budget}
            />
          </Grid>
          <Grid size={12}>
            <SpendingTrendsChart
              isLoading={isLoadingHistorical}
              insights={historical?.spending}
            />
          </Grid>
        </Grid>
      </PageContent>
    </Page>
  );
}
