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

import OptionsMenu from "@/components/OptionsMenu";
import Page from "@/layout/Page";
import PageHeader from "@/layout/PageHeader";
import PageTitle from "@/layout/PageTitle";

import { getCategories } from "./Category.service";

export const Category = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { data: categories, error } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  useEffect(() => {
    if (error) {
      enqueueSnackbar("Failed to load categorys", { variant: "error" });
    }
  }, [error]);

  const handleEdit = (id?: string) => {
    navigate(`/finance/category/${id}/edit`);
  };

  return (
    <Page>
      <PageHeader>
        <PageTitle>Categories</PageTitle>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          href="/finance/category/new"
        >
          Create a new Category
        </Button>
      </PageHeader>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Name</TableCell>
              <TableCell align="right" sx={{ width: 50 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {categories?.map((category) => (
              <TableRow key={category.id}>
                <TableCell sx={{ textTransform: "capitalize", width: 120 }}>
                  {category.type}
                </TableCell>
                <TableCell>{category.name}</TableCell>
                <TableCell align="right">
                  <OptionsMenu>
                    <MenuItem onClick={() => handleEdit(category.id)}>
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

export default Category;
