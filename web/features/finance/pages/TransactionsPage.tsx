import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { DataGrid, gridClasses, type GridColDef } from "@mui/x-data-grid";

import Page from "@/components/Page";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/money";
import { useTransactions } from "../Finance.hooks";
import type { Transaction, TransactionType } from "../Finance.model";

interface TransactionTypeCellProps {
    type: TransactionType;
}

interface TypeConfig {
    label: string;
    color: "success" | "error" | "info" | "default";
    icon: React.ReactElement;
}

const TYPE_CONFIG: Record<TransactionType, TypeConfig> = {
    income: {
        label: "Income",
        color: "success",
        icon: <TrendingUpIcon fontSize="small" />,
    },
    expense: {
        label: "Expense",
        color: "error",
        icon: <TrendingDownIcon fontSize="small" />,
    },
    transfer: {
        label: "Transfer",
        color: "info",
        icon: <SwapHorizIcon fontSize="small" />,
    },
    unknown: {
        label: "Unknown",
        color: "default",
        icon: <HelpOutlineIcon fontSize="small" />,
    },
};

export function TransactionTypeCell({ type }: TransactionTypeCellProps) {
    const config = TYPE_CONFIG[type ?? "expense"];

    return (
        <Box display="flex" alignItems="center" height="100%">
            <Chip
                label={config.label}
                color={config.color}
                icon={config.icon}
                variant="outlined"
            />
        </Box>
    );
}

function AmountCell({ row }: { row: Transaction }) {
    const amount = row.amount
        ? { currency: row.amount.currency, cents: -row.amount.cents }
        : money.zero();
    const baseAmount = row.base_amount ?? money.zero();

    const sameCurrency =
        row.amount?.currency === row.base_amount?.currency ||
        row.exchange_rate === 1;

    if (sameCurrency) {
        return <Typography variant="body2">{money.format(amount)}</Typography>;
    }

    return (
        <Stack spacing={0.25}>
            <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography variant="body2" fontWeight="medium" color="error">
                    {money.format(amount)}
                </Typography>
                <Tooltip
                    title={`Exchange rate: ${row.exchange_rate?.toFixed(2)}`}
                    placement="top"
                >
                    <InfoOutlinedIcon
                        sx={{ fontSize: 14, color: "text.secondary", cursor: "help" }}
                    />
                </Tooltip>
            </Stack>
            <Typography variant="caption" color="text.secondary">
                ≈ {money.format(baseAmount)}
            </Typography>
        </Stack>
    );
}

const transactionColumns: GridColDef<Transaction>[] = [
    {
        field: "name",
        headerName: "Name",
        width: 200,
        renderCell: ({ row }) => (
            <Typography variant="body2">{row.name}</Typography>
        ),
    },
    {
        field: "date",
        headerName: "Date",
        width: 150,
        renderCell: ({ row }) => (
            <Typography variant="body2">
                {row.date && new Date(row.date).toLocaleDateString()}
            </Typography>
        ),
    },
    {
        field: "amount_display",
        headerName: "Amount",
        width: 200,
        renderCell: ({ row }) => <AmountCell row={row} />,
    },
    {
        field: "type",
        headerName: "Type",
        width: 130,
        renderCell: ({ row }) => (
            <TransactionTypeCell type={row.type ?? "unknown"} />
        ),
    },
];

export default function TransactionsPage() {
    const { data: transactions } = useTransactions();

    return (
        <Page>
            <PageHeader
                title="Transactions"
                subtitle="Understand where your money goes."
            />
            <Box sx={{ flex: 1, width: "100%" }}>
                <DataGrid
                    columns={transactionColumns}
                    rows={transactions?.transactions}
                    getRowHeight={() => "auto"}
                    sx={{
                        [`& .${gridClasses.cell}`]: {
                            display: "flex",
                            alignItems: "center",
                            py: 1,
                        },
                        [`& .${gridClasses.columnHeader}, & .${gridClasses.cell}`]: {
                            outline: "transparent",
                        },
                        [`& .${gridClasses.columnHeader}:focus-within, & .${gridClasses.cell}:focus-within`]:
                        {
                            outline: "none",
                        },
                        [`& .${gridClasses.row}:hover`]: {
                            cursor: "pointer",
                        },
                    }}
                />
            </Box>
        </Page>
    );
}
