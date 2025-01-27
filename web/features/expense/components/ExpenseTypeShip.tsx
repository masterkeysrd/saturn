import Chip from "@mui/material/Chip";

import { ExpenseType } from "../Expense.model";
import { getExpenseTypeLabel } from "../Expense.utils";

export interface ExpenseTypeShipProps {
  type: ExpenseType | undefined;
}

export const ExpenseTypeShip = ({ type }: ExpenseTypeShipProps) => {
  const color = type === "fixed" ? "primary" : "secondary";
  return (
    <Chip
      label={getExpenseTypeLabel(type)}
      color={color}
      size="small"
      sx={{ textTransform: "capitalize" }}
    />
  );
};

export default ExpenseTypeShip;
