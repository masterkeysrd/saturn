import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { DataGrid } from "@mui/x-data-grid";
import { GridColDef } from "@mui/x-data-grid";
import { useAuth } from "../../../lib/auth/AuthContext";

const columns: GridColDef[] = [
  {
    field: "expense",
    headerName: "Expense",
    flex: 1,
    renderCell: (params) => {
      return (
        <Box
          display="flex"
          alignItems="center"
          alignContent="center"
          height="100%"
        >
          <Typography variant="body2">{params.value}</Typography>
        </Box>
      );
    },
  },
  {
    field: "amount",
    headerName: "Amount",
    width: 150,
    align: "right",
    headerAlign: "right",
    renderCell: (params) => {
      return (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="flex-end"
          height="100%"
          width="100%"
        >
          <Typography variant="body2" align="right">
            $ {params.value}
          </Typography>
        </Box>
      );
    },
  },
];

const rows = [
  { id: 1, expense: "Groceries", amount: 100, date: "2021-10-01" },
  { id: 2, expense: "Gas", amount: 50, date: "2021-10-02" },
  { id: 3, expense: "Rent", amount: 1000, date: "2021-10-03" },
  { id: 4, expense: "Utilities", amount: 200, date: "2021-10-04" },
  { id: 5, expense: "Internet", amount: 50, date: "2021-10-05" },
];

export default function ExpenseList() {
  const { isAuthenticated } = useAuth();

  console.log("isAuthenticated", isAuthenticated);
  return (
    <div>
      <h1>Expense List</h1>
      <Paper sx={{ height: 400, width: "100%" }}>
        <DataGrid rows={rows} columns={columns} />
      </Paper>
    </div>
  );
}
