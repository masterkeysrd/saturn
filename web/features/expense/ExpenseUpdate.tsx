import styled from "@mui/material/styles/styled";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import FormControl from "@mui/material/FormControl";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useNavigate, useParams } from "react-router";
import { Expense } from "./Expense.model";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createExpense, getExpense, updateExpense } from "./Expense.service";
import { useSnackbar } from "notistack";

export const ExpenseUpdate = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { id } = useParams<"id">();
  const isNew = id === undefined;
  const title = isNew ? "New Expense" : "Update Expense";

  const [expense, setExpense] = useState<Expense>({});

  const queryClient = useQueryClient();
  const { data: expenseData, isLoading } = useQuery({
    enabled: !isNew,
    queryKey: ["expense", id],
    queryFn: async () => getExpense(id!),
  });

  const createExpenseMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => handleSaveSuccess(),
  });

  const updateExpenseMutation = useMutation({
    mutationFn: updateExpense,
    onSuccess: () => handleSaveSuccess(),
  });

  useEffect(() => {
    if (isNew) {
      setExpense({});
    }
  }, [isNew]);

  useEffect(() => {
    if (expenseData) {
      setExpense(expenseData);
    }
  }, [expenseData]);

  const handleDescriptionChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setExpense({ ...expense, description: event.target.value });
  };

  const handleAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setExpense({ ...expense, amount: parseFloat(event.target.value) });
  };

  const handleSave = () => {
    const data = {
      ...expense,
      // Convert the amount to cents
      amount: (expense.amount || 0) * 100,
    };
    if (isNew) {
      createExpenseMutation.mutate(data);
    } else {
      updateExpenseMutation.mutate(data);
    }
  };

  const handleSaveSuccess = () => {
    // Show a success message
    enqueueSnackbar(isNew ? "Expense created" : "Expense updated", {
      variant: "success",
    });

    // Invalidate the cache and navigate back to the list
    queryClient.invalidateQueries({ queryKey: ["expenses"] });

    // Close the dialog
    handleClose();
  };

  const handleClose = () => {
    navigate("/expense");
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Dialog open={true} fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Form>
          <FormControl fullWidth>
            <Typography
              variant="subtitle1"
              component={"label"}
              htmlFor="description"
            >
              Description
            </Typography>
            <TextField
              name="description"
              variant="outlined"
              margin="dense"
              placeholder="Enter description"
              autoFocus
              fullWidth
              value={expense?.description}
              onChange={handleDescriptionChange}
            />
          </FormControl>
          <FormControl fullWidth>
            <Typography
              variant="subtitle1"
              component={"label"}
              htmlFor="amount"
            >
              Amount
            </Typography>
            <TextField
              name="amount"
              type="number"
              variant="outlined"
              margin="dense"
              placeholder="Enter amount"
              fullWidth
              value={expense?.amount}
              onChange={handleAmountChange}
            />
          </FormControl>
        </Form>
      </DialogContent>
      <DialogActions>
        <Button color="error" variant="contained" onClick={handleClose}>
          Cancel
        </Button>
        <Button color="primary" variant="contained" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface FormProps {
  children: React.ReactNode;
}

const Form = ({ children }: FormProps) => {
  return <FormContainer>{children}</FormContainer>;
};

const FormContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(2),
  px: theme.spacing(2),
}));

export default ExpenseUpdate;
