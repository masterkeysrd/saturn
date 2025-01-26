import { useQuery } from "@tanstack/react-query";
import Page from "../../components/Page";
import PageTitle from "../../components/PageTitle";
import { getExpenses } from "./Expense.service";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import money from "../../lib/money";
import PageHeader from "../../components/PageHeader";
import { Outlet } from "react-router";

export default function Expense() {
  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: getExpenses,
  });

  return (
    <Page>
      <PageHeader>
        <PageTitle>Expenses</PageTitle>
        <Button variant="contained" color="primary" href="/expense/new">
          Add Expense
        </Button>
      </PageHeader>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {expenses?.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{expense.description}</TableCell>
                <TableCell align="right">
                  {money.format(expense.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Outlet />
      </TableContainer>
    </Page>
  );
}
