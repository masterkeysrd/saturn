import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { useNavigate, useParams } from "react-router";
import { Budget } from "./Budget.model";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBudget, getBudget, updateBudget } from "./Budget.service";
import { useSnackbar } from "notistack";

import { useForm } from "react-hook-form";
import money from "../../lib/money";
import FormTextField from "../../components/FormTextField";

const form = {
  description: {
    required: "Description is required",
  },
  amount: {
    required: "Amount is required",
    min: 1,
  },
};

export const BudgetUpdate = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { id } = useParams<"id">();
  const isNew = id === undefined;
  const title = isNew ? "Create Budget" : "Edit Budget";

  const queryClient = useQueryClient();
  const { data: budget, isLoading } = useQuery({
    enabled: !isNew,
    queryKey: ["budgets", id],
    queryFn: async () => getBudget(id!),
  });

  const { register, formState, handleSubmit } = useForm<Budget>({
    mode: "onSubmit",
    values: isNew
      ? {
          amount: 0,
        }
      : {
          ...budget,
          amount: money.fromCents(budget?.amount || 0),
        },
  });

  const createBudgetMutation = useMutation({
    mutationFn: createBudget,
    onSuccess: () => handleSaveSuccess(),
  });

  const updateBudgetMutation = useMutation({
    mutationFn: updateBudget,
    onSuccess: () => handleSaveSuccess(),
  });

  const handleSave = (budget: Budget) => {
    const data = {
      ...budget,
      // Convert the amount to cents
      amount: money.toCents(budget.amount),
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
    <Dialog
      open={true}
      onClose={handleClose}
      PaperProps={{
        component: "form",
        onSubmit: handleSubmit(handleSave),
        sx: { minWidth: 400 },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent
        dividers
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <FormTextField
          label="Description"
          autoFocus
          fullWidth
          {...register("description", form.description)}
          error={formState.errors.description}
        />
        <FormTextField
          label="Amount"
          fullWidth
          type="number"
          {...register("amount", form.amount)}
          error={formState.errors.amount}
          sx={{ mb: 2 }}
        />
      </DialogContent>
      <DialogActions sx={{ my: 1 }}>
        <Button color="error" variant="contained" onClick={handleClose}>
          Cancel
        </Button>
        <Button color="primary" variant="contained" type="submit">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BudgetUpdate;
