import { styled } from "@mui/material";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { money } from "@/lib/money";
import type { SpendingSummary } from "../Finance.model";

export interface SpentSummaryCardProps {
    summary: SpendingSummary;
}

const Container = styled(Stack)({
    minWidth: '300px',
});

const SummaryRowLabel = styled(Typography)(({ theme }) => ({
    color: theme.palette.text.secondary,
    fontSize: '1rem',
    fontWeight: '500',
}));

const SummaryRowText = styled(Typography)({
    fontSize: '1rem',
    fontWeight: '400',
});

const AmountText = styled(Typography)(({ theme }) => ({
    fontSize: '2rem',
    fontWeight: '500',
    marginTop: theme.spacing(1),
}));

interface SummaryRowProps {
    label: string;
    value: string | number;
}

function SummaryRow({ label, value }: SummaryRowProps) {
    return (
        <Box display="flex" alignItems="center" justifyContent="space-between">
            <SummaryRowLabel>
                {label}
            </SummaryRowLabel>
            <SummaryRowText variant="body2" fontWeight="medium">
                {value}
            </SummaryRowText>
        </Box>
    );
}

export default function SpentSummaryCard({ summary }: SpentSummaryCardProps) {
    const { budgeted, spent, remaining, usage, count } = summary
    return (
        <Card sx={{ height: "100%" }}>
            <CardContent>
                <Container spacing={2}>
                    <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Expenses
                        </Typography>
                        <AmountText variant="h4">
                            {money.format(spent)}
                        </AmountText>
                    </Box>

                    <Stack spacing={1}>
                        <SummaryRow label="Budgeted" value={money.format(budgeted)} />
                        <SummaryRow label="Remaining" value={money.format(remaining)} />
                        <SummaryRow label="Used" value={`${usage.toFixed(2)}%`} />
                        <SummaryRow label="Transactions" value={count.toLocaleString()} />
                    </Stack>
                </Container>
            </CardContent>
        </Card>
    )
}
