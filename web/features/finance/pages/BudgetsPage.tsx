import { useCallback, useMemo } from "react";
import { Outlet, useNavigate } from "react-router";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import Page from "@/components/Page";
import PageContent from "@/components/PageContent";
import PageHeader from "@/components/PageHeader";
import { useBudgets } from "../Finance.hooks";
import DataGrid, {
  GridActionsCellItem,
  type GridColDef,
} from "@/components/DataGrid";
import type { Budget } from "../Finance.model";
import AmountCell from "../components/AmountCell";
import { money } from "@/lib/money";

export default function BudgetsPage() {
  const navigate = useNavigate();
  const { data: budgets, isLoading } = useBudgets();

  const handleRowEdit = useCallback(
    (budget: Budget) => () => {
      navigate(`${budget.id}/edit`);
    },
    [navigate],
  );

  const budgetColumns: GridColDef<Budget>[] = useMemo(
    () => [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        renderCell: ({ row }) => (
          <Stack>
            <Typography variant="body2">{row.name}</Typography>
          </Stack>
        ),
      },
      {
        field: "amount_display",
        headerName: "Amount",
        width: 200,
        renderCell: ({ row }) => (
          <AmountCell
            amount={row?.amount ?? money.zero()}
            baseAmount={row?.base_amount ?? money.zero()}
            exchangeRate={1}
          />
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
        title="Budget"
        subtitle="	Set goals, manage expenses, build stability"
      >
        <PageHeader.Actions>
          <Button variant="contained" startIcon={<AddIcon />} href="new">
            Create
          </Button>
        </PageHeader.Actions>
      </PageHeader>
      <PageContent>
        <Box sx={{ flex: 1, width: "100%" }}>
          <DataGrid
            columns={budgetColumns}
            rows={budgets}
            loading={isLoading}
          />
        </Box>
      </PageContent>
      <Outlet />
    </Page>
  );
}
