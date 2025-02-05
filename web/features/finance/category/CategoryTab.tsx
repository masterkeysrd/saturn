import { Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";

import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";

import Link from "@/components/Link";

import { CategoryType } from "./Category.model";
import { getCategories } from "./Category.service";

type CategoryTabProps = {
  type: CategoryType;
};

export const CategoryTab = ({ type }: CategoryTabProps) => {
  const { data: categories, error } = useQuery({
    queryKey: ["categories", type],
    queryFn: () => getCategories(type),
  });

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {categories?.map((category) => (
            <TableRow key={category.id}>
              <TableCell>
                <Link href={`/finance/category/${type}/${category.id}`}>
                  {category.name}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Outlet />
    </TableContainer>
  );
};

export default CategoryTab;
