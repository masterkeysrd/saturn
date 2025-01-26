import { Outlet } from "react-router";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Page from "../../components/Page";
import PageHeader from "../../components/PageHeader";
import PageTitle from "../../components/PageTitle";
import { getExpenseTypeLabel } from "./Expense.utils";
import { useQuery } from "@tanstack/react-query";
import { getExpenses } from "./Expense.service";
import money from "../../lib/money";

export const Expense = () => {
  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: getExpenses,
  });

  return (
    <Page>
      <PageHeader>
        <PageTitle>Expenses</PageTitle>
        <Button variant="contained" color="primary" href="/expense/new">
          Create a new Expense
        </Button>
      </PageHeader>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Budget</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {expenses?.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{getExpenseTypeLabel(expense.type)}</TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell>{expense.budget?.description}</TableCell>
                <TableCell align="right">
                  {money.format(expense.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Outlet />
    </Page>
  );
};

export default Expense;
