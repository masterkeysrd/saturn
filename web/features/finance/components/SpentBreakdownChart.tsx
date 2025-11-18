import { useMemo } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography  from "@mui/material/Typography";
import { PieChart, type PieChartProps } from "@mui/x-charts/PieChart";
import PieCenterLabel from "@/components/PieCenterLabel";
import { money } from "@/lib/money";
import type { SpendingBudgetSummary, SpendingSummary } from "../Insights.model";

export interface SpentBreakdownChartProps {
    summary: SpendingSummary;
    budgets: SpendingBudgetSummary[];
}

type ValueFormatter = PieChartProps['series'][number]['valueFormatter'];

const getSeries = (budgets: SpendingBudgetSummary[]) => (budgets
    .map((budget) => ({
        label: budget.budget_name,
        value: budget.spent.cents / 100,
    }))
);

export default function SpentBreakdownChart({ summary, budgets }: SpentBreakdownChartProps) {
    const data = useMemo(() => getSeries(budgets), [budgets]);

    const valueFormatter: ValueFormatter = (_, { dataIndex }) => {
        const budget = budgets[dataIndex];
        if (!budget) {
            return null;
        }

        return money.format(budget.spent);
    }

    if (budgets.length === 0) {
        return (
            <Card sx={{ height: "100%" }}>
                <CardContent sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                        No expense data available
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardContent sx={{ height: 300 }}>
                <Typography variant="subtitle2">Current Month Expenses</Typography>
                <PieChart
                    sx={(theme) => ({
                        marginTop: theme.spacing(1.5),
                    })}
                    series={[
                        {
                            data,
                            valueFormatter,
                            innerRadius: 80,
                            outerRadius: 100,
                            paddingAngle: 0,
                            highlightScope: { fade: 'global', highlight: 'item' },
                        }
                    ]}>
                    <PieCenterLabel
                        primaryText={money.format(summary.spent)}
                        secondaryText={`of ${money.format(summary.budgeted)}`}
                    />
                </PieChart>
            </CardContent>
        </Card>
    );
}
