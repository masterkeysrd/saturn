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
import { Budget } from "./Budget.model";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBudget, getBudget, updateBudget } from "./Budget.service";
import { useSnackbar } from "notistack";

export const BudgetUpdate = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { id } = useParams<"id">();
  const isNew = id === undefined;
  const title = isNew ? "Create Budget" : "Edit Budget";

  const [budget, setBudget] = useState<Budget>({});

  const queryClient = useQueryClient();
  const { data: budgetData, isLoading } = useQuery({
    enabled: !isNew,
    queryKey: ["budgets", id],
    queryFn: async () => getBudget(id!),
  });

  const createBudgetMutation = useMutation({
    mutationFn: createBudget,
    onSuccess: () => handleSaveSuccess(),
  });

  const updateBudgetMutation = useMutation({
    mutationFn: updateBudget,
    onSuccess: () => handleSaveSuccess(),
  });

  useEffect(() => {
    if (isNew) {
      setBudget({});
    }
  }, [isNew]);

  useEffect(() => {
    if (budgetData) {
      setBudget(budgetData);
    }
  }, [budgetData]);

  const handleDescriptionChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setBudget({ ...budget, description: event.target.value });
  };

  const handleAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBudget({ ...budget, amount: parseFloat(event.target.value) });
  };

  const handleSave = () => {
    const data = {
      ...budget,
      // Convert the amount to cents
      amount: (budget.amount || 0) * 100,
    };
    if (isNew) {
      createBudgetMutation.mutate(data);
    } else {
      updateBudgetMutation.mutate(data);
    }
  };

  const handleSaveSuccess = () => {
    // Show a success message
    enqueueSnackbar(isNew ? "Budget created" : "Budget updated", {
      variant: "success",
    });

    // Invalidate the cache and navigate back to the list
    queryClient.invalidateQueries({ queryKey: ["budgets"] });

    // Close the dialog
    handleClose();
  };

  const handleClose = () => {
    navigate("/budget");
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
              value={budget?.description}
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
              value={budget?.amount}
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

export default BudgetUpdate;
