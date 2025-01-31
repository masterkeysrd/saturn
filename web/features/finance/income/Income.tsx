import { Outlet, useNavigate } from "react-router";

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

import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";

import Link from "../../../components/Link";
import Page from "../../../layout/Page";
import PageHeader from "../../../layout/PageHeader";
import PageTitle from "../../../layout/PageTitle";
import money from "../../../lib/money";
import { useQuery } from "@tanstack/react-query";
import { getIncomes } from "./Income.service";
import OptionsMenu from "../../../components/OptionsMenu";

export const Income = () => {
  const navigate = useNavigate();

  const { data: incomes } = useQuery({
    queryKey: ["incomes"],
    queryFn: getIncomes,
  });

  const handleEdit = (id?: string) => {
    navigate(`/finance/income/${id}/edit`);
  };

  return (
    <Page>
      <PageHeader>
        <PageTitle>Income</PageTitle>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          href="/finance/income/new"
        >
          Create a new Income
        </Button>
      </PageHeader>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right" sx={{ width: 50 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {incomes?.map((income) => (
              <TableRow key={income.id}>
                <TableCell>
                  <Link href={`/finance/income/${income.id}`}>
                    {income.name}
                  </Link>
                </TableCell>
                <TableCell align="right">
                  {money.format(income.amount)}
                </TableCell>
                <TableCell align="right">
                  <OptionsMenu>
                    <MenuItem onClick={() => handleEdit(income.id)}>
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

export default Income;
