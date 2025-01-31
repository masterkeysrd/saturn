import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

import CloseIcon from "@mui/icons-material/Close";

import money from "../../../lib/money";
import { getExpense } from "./Expense.service";
import ExpenseTypeShip from "./components/ExpenseTypeShip";

export const ExpenseDetails = () => {
  const navigate = useNavigate();

  const { id } = useParams<"id">();

  const { data: expense, isLoading: isLoadingExpense } = useQuery({
    queryKey: ["expense", id],
    queryFn: () => getExpense(id!),
  });

  const handleClose = () => {
    navigate("/finance/expense");
  };

  if (isLoadingExpense) {
    return <div>Loading...</div>;
  }

  if (!expense) {
    // TODO: Add a 404 page
    return <div>Expense not found</div>;
  }

  return (
    <Drawer anchor="right" open>
      <Box sx={{ width: 400, p: 2 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography variant="h6">Expense Details</Typography>
          <IconButton onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>
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
            Billing Day
          </Typography>
          <Typography component="dd" variant="body2" sx={{ mb: 2 }}>
            {expense.billingDay} of the month
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
