import { useCallback, useMemo } from "react";
import { Link, Outlet, useNavigate } from "react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PaidIcon from "@mui/icons-material/Paid";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import {
  usePopupState,
  bindTrigger,
  bindMenu,
} from "material-ui-popup-state/hooks";
import Page from "@/components/Page";
import PageContent from "@/components/PageContent";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/money";
import DataGrid, {
  type GridColDef,
  GridActionsCellItem,
} from "@/components/DataGrid";

import { useTransactions } from "../Finance.hooks";
import type { Transaction, TransactionType } from "../Finance.model";
import AmountCell from "../components/AmountCell";

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

const PageActions = () => {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "transactionActions",
  });
  return (
    <div>
      <Button
        variant="contained"
        {...bindTrigger(popupState)}
        startIcon={<AddIcon />}
        endIcon={<KeyboardArrowDownIcon />}
      >
        Create
      </Button>
      <Menu
        {...bindMenu(popupState)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        <MenuItem component={Link} to="expenses/new" onClick={popupState.close}>
          <ListItemIcon>
            <PaidIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Expense</ListItemText>
        </MenuItem>
      </Menu>
    </div>
  );
};

export default function TransactionsPage() {
  const { data: transactions } = useTransactions();
  const navigate = useNavigate();

  const handleRowEdit = useCallback(
    (transaction: Transaction) => () => {
      navigate(`${transaction.type}s/${transaction.id}/edit`);
    },
    [navigate],
  );
  const transactionColumns: GridColDef<Transaction>[] = useMemo(
    () => [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        renderCell: ({ row }) => (
          <Stack>
            <Typography variant="body2">{row.name}</Typography>
            <Typography variant="caption" color="textSecondary">
              {row.description}
            </Typography>
          </Stack>
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
        renderCell: ({ row }) => (
          <AmountCell
            amount={row.amount ?? money.zero()}
            baseAmount={row.base_amount ?? money.zero()}
            exchangeRate={row.exchange_rate ?? 0}
          />
        ),
      },
      {
        field: "type",
        headerName: "Type",
        width: 130,
        renderCell: ({ row }) => (
          <TransactionTypeCell type={row.type ?? "unknown"} />
        ),
      },
      {
        field: "actions",
        type: "actions",
        align: "right",
        getActions: ({ row }) => [
          <GridActionsCellItem
            key="edit-transaction"
            label="Edit"
            icon={<EditIcon />}
            onClick={handleRowEdit(row)}
            showInMenu={false}
          />,
        ],
      },
    ],
    [handleRowEdit],
  );

  return (
    <Page>
      <PageHeader
        title="Transactions"
        subtitle="Understand where your money goes."
      >
        <PageHeader.Actions>
          <PageActions />
        </PageHeader.Actions>
      </PageHeader>
      <PageContent>
        <Box sx={{ flex: 1, width: "100%" }}>
          <DataGrid
            rows={transactions?.transactions}
            columns={transactionColumns}
          />
        </Box>
      </PageContent>
      <Outlet />
    </Page>
  );
}
