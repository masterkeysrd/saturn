import { useQuery } from "@tanstack/react-query";

import Page from "../../layout/Page";
import PageHeader from "../../layout/PageHeader";
import PageTitle from "../../layout/PageTitle";

import { getBudgets } from "./Budget.service";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import money from "../../lib/money";
import { Outlet } from "react-router";
import { useSnackbar } from "notistack";
import { useEffect } from "react";

export const Budget = () => {
  const { enqueueSnackbar } = useSnackbar();

  const { data: budgets, error } = useQuery({
    queryKey: ["budgets"],
    queryFn: getBudgets,
  });

  useEffect(() => {
    if (error) {
      enqueueSnackbar("Failed to load budgets", { variant: "error" });
    }
  }, [error]);

  return (
    <Page>
      <PageHeader>
        <PageTitle>Budgets</PageTitle>
        <Button variant="contained" color="primary" href="/budget/new">
          Create a new Budget
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
            {budgets?.map((budget) => (
              <TableRow key={budget.id}>
                <TableCell>{budget.description}</TableCell>
                <TableCell align="right">
                  {money.format(budget.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Outlet />
      </TableContainer>
    </Page>
  );
};

export default Budget;
