import { Outlet, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";

import Button from "@mui/material/Button";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import Paper from "@mui/material/Paper";
import Page from "../../layout/Page";
import PageHeader from "../../layout/PageHeader";
import PageTitle from "../../layout/PageTitle";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

import EditIcon from "@mui/icons-material/Edit";

import money from "../../lib/money";
import Link from "../../components/Link";
import OptionsMenu from "../../components/OptionsMenu";

import { getExpenses } from "./Expense.service";
import ExpenseTypeShip from "./components/ExpenseTypeShip";

export const Expense = () => {
  const navigate = useNavigate();

  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: getExpenses,
  });

  const handleEdit = (id?: string) => {
    navigate(`/expense/${id}/edit`);
  };

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
              <TableCell>Description</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Budget</TableCell>
              <TableCell>Billing Day</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {expenses?.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>
                  <Link href={`/expense/${expense.id}`}>
                    {expense.description}
                  </Link>
                </TableCell>
                <TableCell>
                  <ExpenseTypeShip type={expense.type} />
                </TableCell>
                <TableCell>
                  <Link href={`/budget/${expense.budget?.id}`}>
                    {expense.budget?.description}
                  </Link>
                </TableCell>
                <TableCell>{expense.billingDay} of the month</TableCell>
                <TableCell align="right">
                  {money.format(expense.amount)}
                </TableCell>
                <TableCell style={{ width: 50 }}>
                  <OptionsMenu>
                    <MenuItem onClick={() => handleEdit(expense.id)}>
                      <ListItemIcon>
                        <EditIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary="Edit" />
                    </MenuItem>
                  </OptionsMenu>
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
