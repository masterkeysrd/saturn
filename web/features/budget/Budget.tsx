import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import Button from "@mui/material/Button";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";

import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";

import money from "../../lib/money";
import Link from "../../components/Link";
import OptionsMenu from "../../components/OptionsMenu";
import Page from "../../layout/Page";
import PageHeader from "../../layout/PageHeader";
import PageTitle from "../../layout/PageTitle";

import { getBudgets } from "./Budget.service";

export const Budget = () => {
  const navigate = useNavigate();
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

  const handleEdit = (id?: string) => {
    navigate(`/budget/${id}/edit`);
  };

  const handleView = (id?: string) => {
    navigate(`/budget/${id}`);
  };

  return (
    <Page>
      <PageHeader>
        <PageTitle>Budgets</PageTitle>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          href="/budget/new"
        >
          Create a new Budget
        </Button>
      </PageHeader>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right" sx={{ width: 50 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {budgets?.map((budget) => (
              <TableRow key={budget.id}>
                <TableCell>
                  <Link href={`/budget/${budget.id}`}>
                    {budget.description}
                  </Link>
                </TableCell>
                <TableCell align="right">
                  {money.format(budget.amount)}
                </TableCell>
                <TableCell align="right">
                  <OptionsMenu>
                    <MenuItem onClick={() => handleView(budget.id)}>
                      <ListItemIcon>
                        <VisibilityIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary="View" />
                    </MenuItem>
                    <MenuItem onClick={() => handleEdit(budget.id)}>
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
        <Outlet />
      </TableContainer>
    </Page>
  );
};

export default Budget;
