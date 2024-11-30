import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import Paper from "@mui/material/Paper";
import { format } from "../../../lib/money";

const expenses = [
  {
    id: "e1",
    description: "New TV",
    amount: 100000,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: "e2",
    description: "Car Insurance",
    amount: 50000,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: "e3",
    description: "New Desk (Wooden)",
    amount: 50000,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: "e4",
    description: "Toilet Paper",
    amount: 10000,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

export default function ExpenseList() {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Description</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {expenses.map((expense) => (
            <TableRow key={expense.id}>
              <TableCell>{expense.description}</TableCell>
              <TableCell align="right">{format(expense.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
