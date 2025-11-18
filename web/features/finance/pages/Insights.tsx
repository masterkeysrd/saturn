import { Grid } from "@mui/material";
import Box from "@mui/material/Box";
import { useInsights } from "../Finance.hooks";
import SpentSummaryCard from "../components/SpentSummaryCard";
import SpentBreakdownChart from "../components/SpentBreakdownChart";
import SpendingTrendsChart from "../components/SpendingTrendsChart";



export default function Insights() {
    const { data: current, isLoading: isLoadingCurrent } = useInsights({
        start_date: '2025-11-01',
        end_date: '2025-11-30',
    })

    const { data: historical, isLoading: isLoadingHistorical } = useInsights({
        start_date: '2025-01-01',
        end_date: '2025-11-30',
    })


    if (isLoadingCurrent || !current) {
        return;
    }

    return (
        <Box sx={{ width: "100%" }}>
            <Grid container spacing={2} columns={12}>
                <Grid size={6}>
                    <SpentSummaryCard summary={current.spending.summary} />
                </Grid>
                <Grid size={6}>
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
        </Box >
    )
}
