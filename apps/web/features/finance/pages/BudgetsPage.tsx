import { useCallback, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { type Budget } from "@saturn/gen/saturn/finance/v1/finance_pb";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import Page from "@/components/Page";
import PageContent from "@/components/PageContent";
import PageHeader from "@/components/PageHeader";
import { useBudgets } from "../Finance.hooks";
import DataGrid, {
  GridActionsCellItem,
  type GridColDef,
  Toolbar,
  type GridToolbarProps,
} from "@/components/DataGrid";
import { BudgetView, type ListBudgetParams } from "../Finance.model";
import AmountCell from "../components/AmountCell";
import { money } from "@/lib/money";
import { useSearchParams } from "@/lib/search-params";
import { PAGE_SIZE_OPTS, usePagination } from "@/lib/pagination";
import { useSearchFilter, type SearchFilterAPI } from "@/lib/search";
import { InputAdornment, TextField } from "@mui/material";
import { SelectedIcon } from "@/components/SelectedIcon";

type SearchPropsType = ReturnType<typeof useSearchFilter>;

declare module "@mui/x-data-grid" {
  interface ToolbarPropsOverrides {
    searchProps?: SearchPropsType;
  }
}

interface CustomToolbarProps extends GridToolbarProps {
  searchProps?: SearchFilterAPI;
}

function CustomToolbar({ searchProps }: CustomToolbarProps) {
  if (!searchProps) return null;

  return (
    <Toolbar>
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 1,
          py: 4,
        }}
      >
        <TextField
          placeholder="Search Budgets"
          variant="outlined"
          size="small"
          sx={{ width: "300px" }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
          // Spread the debounced search control props (value and onChange)
          {...searchProps}
        />
      </Box>
    </Toolbar>
  );
}

export default function BudgetsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [params, setParams] = useSearchParams<ListBudgetParams>({
    page: 1,
    pageSize: 10,
    search: "",
  });
  const searchProps = useSearchFilter(params.search, setParams);
  const paginationProps = usePagination(params, setParams);

  const { data: page, isLoading } = useBudgets({
    ...params,
    view: BudgetView.FULL,
  });

  const handleRowEdit = useCallback(
    (budget: Budget) => () => {
      navigate(`${budget.id}/edit`);
    },
    [navigate],
  );

  const handleRowDelete = useCallback(
    (budget: Budget) => () => {
      navigate(`${budget.id}/delete${location.search}`);
    },
    [navigate, location],
  );

  const budgetColumns: GridColDef<Budget>[] = useMemo(
    () => [
      {
        field: "name",
        headerName: "Name",
        flex: 1,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" gap={0.5}>
            {row?.appearance?.icon && (
              <SelectedIcon
                name={row?.appearance?.icon}
                color="secondary"
                size={24}
              />
            )}
            <Typography variant="subtitle2">{row.name}</Typography>
          </Stack>
        ),
      },
      {
        field: "amount_display",
        headerName: "Amount",
        headerAlign: "right",
        align: "right",
        width: 150,
        renderCell: ({ row }) => (
          <AmountCell
            amount={row?.amount ?? money.zero()}
            baseAmount={row?.baseAmount ?? money.zero()}
          />
        ),
      },
      {
        field: "spent_display",
        headerName: "Spent",
        headerAlign: "right",
        width: 150,
        align: "right",
        renderCell: ({ row }) => (
          <AmountCell
            amount={row?.stats?.spentAmount ?? money.zero()}
            baseAmount={row?.stats?.spentAmount ?? money.zero()}
          />
        ),
      },
      {
        field: "remaining_display",
        headerName: "Remaining",
        headerAlign: "right",
        width: 150,
        align: "right",
        renderCell: ({ row }) => (
          <AmountCell
            amount={row?.stats?.remainingAmount ?? money.zero()}
            baseAmount={row?.stats?.remainingAmount ?? money.zero()}
          />
        ),
      },
      {
        field: "percentage",
        headerName: "Percentage",
        headerAlign: "right",
        width: 100,
        align: "right",
        renderCell: ({ row }) => {
          const percentage = row.stats?.usagePercentage || 0;
          return (
            <Typography
              variant="body2"
              sx={{
                textAlign: "right",
                width: "100%",
                fontVariantNumeric: "tabular-nums",
                color: percentage >= 100 ? "error.main" : "text.primary",
              }}
            >
              {percentage.toFixed(2)}%
            </Typography>
          );
        },
      },
      {
        field: "transactions_count",
        headerName: "Transactions",
        headerAlign: "right",
        width: 130,
        align: "right",
        renderCell: ({ row }) => (
          <Typography variant="body2">
            {row.stats?.transactionCount ?? 0}
          </Typography>
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
          <GridActionsCellItem
            key="edit-transaction"
            label="Edit"
            icon={<DeleteIcon />}
            onClick={handleRowDelete(row)}
            showInMenu={false}
          />,
        ],
      },
    ],
    [handleRowEdit, handleRowDelete],
  );

  return (
    <Page>
      <PageHeader
        title="Budget"
        subtitle="Set goals, manage expenses, build stability"
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
            rows={page?.budgets}
            loading={isLoading}
            rowCount={page?.totalSize}
            pageSizeOptions={PAGE_SIZE_OPTS}
            slots={{
              toolbar: CustomToolbar,
            }}
            slotProps={{
              toolbar: { searchProps },
            }}
            showToolbar
            {...paginationProps}
          />
        </Box>
      </PageContent>
      <Outlet />
    </Page>
  );
}
