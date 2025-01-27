import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { getExpense } from "./Expense.service";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import money from "../../lib/money";
import ExpenseTypeShip from "./components/ExpenseTypeShip";

export const ExpenseDetails = () => {
  const { id } = useParams<"id">();

  const { data: expense, isLoading: isLoadingExpense } = useQuery({
    queryKey: ["expense", id],
    queryFn: () => getExpense(id!),
  });

  if (isLoadingExpense) {
    return <div>Loading...</div>;
  }

  if (!expense) {
    // TODO: Add a 404 page
    return <div>Expense not found</div>;
  }

  return (
    <Drawer anchor="right" open>
      <Box sx={{ width: 300, p: 2 }}>
        <Typography variant="h6">Expense Details</Typography>
        <Box component="dl">
          <Typography component="dt" variant="subtitle2">
            ID
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {expense.id}
          </Typography>
          <Typography component="dt" variant="subtitle2">
            Type
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            <ExpenseTypeShip type={expense.type} />
          </Typography>
          <Typography component="dt" variant="subtitle2">
            Description
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {expense.description}
          </Typography>
          <Typography component="dt" variant="subtitle2">
            Budget
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {expense.budget?.description}
          </Typography>
          <Typography component="dt" variant="subtitle2">
            Amount
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {money.format(expense.amount)}
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
};

export default ExpenseDetails;
