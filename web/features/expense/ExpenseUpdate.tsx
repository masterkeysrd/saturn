import { useNavigate, useParams } from "react-router";
import { useForm } from "react-hook-form";
import { AxiosError } from "axios";
import { useSnackbar } from "notistack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";

import FormRadioGroup from "../../components/FormRadioGroup";
import FormSelect from "../../components/FormSelect";
import FormTextField from "../../components/FormTextField";

import { Expense } from "./Expense.model";
import { createExpense, getExpense, updateExpense } from "./Expense.service";
import { ExpenseTypesList } from "./Expense.constants";
import { getBudgets } from "../budget/Budget.service";
import money from "../../lib/money";

const form = {
  budget: {
    required: "Budget is required",
  },
  description: {
    required: "Description is required",
  },
  type: {
    required: "Type is required",
  },
  billingDay: {
    required: "Billing day is required",
    min: 1,
    max: 31,
  },
  amount: {
    required: "Amount is required",
    min: 1,
  },
};

export const ExpenseUpdate = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { id } = useParams<"id">();
  const isNew = id === undefined;
  const title = isNew ? "Create Expense" : "Edit Expense";
  const types = ExpenseTypesList.filter((type) => type.value !== "unknown");

  const queryClient = useQueryClient();

  const { data: budgets, isLoading: isLoadingBudgets } = useQuery({
    queryKey: ["budgets"],
    queryFn: getBudgets,
  });

  const { data: expense, isLoading: isLoadingExpense } = useQuery({
    enabled: !isNew,
    queryKey: ["expenses", id],
    queryFn: async () => getExpense(id!),
  });

  const createExpenseMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => handleSaveSuccess(),
    onError: (error: AxiosError) => handleSaveFailure(error),
  });

  const updateExpenseMutation = useMutation({
    mutationFn: updateExpense,
    onSuccess: () => handleSaveSuccess(),
    onError: (error: AxiosError) => handleSaveFailure(error),
  });

  const { register, control, handleSubmit, formState } = useForm<Expense>({
    mode: "onSubmit",
    values: isNew
      ? {
          type: "fixed",
          description: "",
          budget: { id: "" },
          billingDay: 1,
          amount: 0,
        }
      : {
          ...expense,
          amount: money.fromCents(expense?.amount),
        },
  });

  const onSubmit = async (data: Expense) => {
    const payload = {
      ...data,
      amount: money.toCents(data.amount),
    };

    if (isNew) {
      createExpenseMutation.mutate(payload);
    } else {
      updateExpenseMutation.mutate(payload);
    }
  };

  const handleClose = () => {
    navigate("/expense");
  };

  const handleSaveSuccess = () => {
    enqueueSnackbar(isNew ? "Expense created" : "Expense updated", {
      variant: "success",
    });
    queryClient.invalidateQueries({
      queryKey: ["expenses"],
    });
    handleClose();
  };

  const handleSaveFailure = (error: AxiosError) => {
    enqueueSnackbar(`Error: ${error.message}`, {
      variant: "error",
    });
  };

  if (isLoadingExpense || isLoadingBudgets) {
    return <Box>Loading</Box>;
  }

  return (
    <Dialog
      open={true}
      fullWidth
      onClose={handleClose}
      PaperProps={{ component: "form", onSubmit: handleSubmit(onSubmit) }}
      onSubmit={handleSubmit(onSubmit)}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent
        dividers
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <FormTextField
          label="Description"
          error={formState.errors.description}
          {...register("description", form.description)}
          defaultValue={expense?.description}
        />
        <FormRadioGroup row control={control} name="type" label="Type">
          {types.map((type) => (
            <FormControlLabel
              key={type.value}
              value={type.value}
              control={<Radio />}
              label={type.label}
            />
          ))}
        </FormRadioGroup>
        <FormSelect
          control={control}
          name="budget.id"
          label="Budget"
          rules={form.budget}
          error={formState.errors.budget?.id}
          defaultValue={expense?.budget}
        >
          {budgets?.map((budget) => (
            <MenuItem key={budget.id} value={budget.id}>
              {budget.description}
            </MenuItem>
          ))}
        </FormSelect>
        <FormSelect
          control={control}
          name="billingDay"
          label="Billing Day"
          rules={form.billingDay}
          error={formState.errors.billingDay}
          defaultValue={expense?.billingDay}
        >
          {[...Array(30)].map((_, index) => (
            <MenuItem key={index + 1} value={index + 1}>
              {index + 1}
            </MenuItem>
          ))}
        </FormSelect>
        <FormTextField
          label="Amount"
          type="number"
          min={form.amount.min}
          sx={{ mb: 2 }}
          error={formState.errors.amount}
          {...register("amount", form.amount)}
          defaultValue={expense?.amount}
        />
      </DialogContent>
      <DialogActions sx={{ my: 1 }}>
        <Button variant="contained" color="error" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          type="submit"
          disabled={formState.isSubmitting}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExpenseUpdate;
