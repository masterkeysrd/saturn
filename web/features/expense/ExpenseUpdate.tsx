import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { createExpense, getExpense, updateExpense } from "./Expense.service";
import { useForm } from "react-hook-form";
import { AxiosError } from "axios";
import { useSnackbar } from "notistack";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import Form from "../../components/Form";
import FormRadioGroup from "../../components/FormRadioGroup";
import FormSelect from "../../components/FormSelect";

import { Expense } from "./Expense.model";
import { ExpenseTypesList } from "./Expense.constants";
import { getBudgets } from "../budget/Budget.service";

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
  amount: {
    required: "Amount is required",
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
    defaultValues: isNew
      ? {
          type: "fixed",
          description: "",
          budget: { id: "" },
          amount: 0,
        }
      : {
          ...expense,
          amount: (expense?.amount || 0) / 100,
        },
  });

  const onSubmit = async (data: Expense) => {
    const payload = {
      ...data,
      amount: (data.amount || 0) * 100,
    };

    if (isNew) {
      createExpenseMutation.mutate(payload);
    } else {
      updateExpenseMutation.mutate(payload);
    }
  };

  const handleSaveSuccess = () => {
    enqueueSnackbar(isNew ? "Expense created" : "Expense updated", {
      variant: "success",
    });
    queryClient.invalidateQueries({
      queryKey: ["expenses"],
    });
    navigate("/expense");
  };

  const handleSaveFailure = (error: AxiosError) => {
    console.error(error);
    enqueueSnackbar("An error occurred", {
      variant: "error",
    });
  };

  if (isLoadingExpense || isLoadingBudgets) {
    return <Box>Loading</Box>;
  }

  return (
    <Dialog open={true} fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Form onSubmit={handleSubmit(onSubmit)}>
          <FormControl fullWidth>
            <Typography
              variant="subtitle1"
              component="label"
              htmlFor="description"
            >
              {title}
            </Typography>
            <TextField
              {...register("description", form.description)}
              defaultValue={expense?.description}
            />
            {formState.errors.description && (
              <Typography color="error">
                {formState.errors.description.message}
              </Typography>
            )}
          </FormControl>
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
            defaultValue={expense?.budget}
          >
            {budgets?.map((budget) => (
              <MenuItem key={budget.id} value={budget.id}>
                {budget.description}
              </MenuItem>
            ))}
          </FormSelect>
          <FormControl fullWidth>
            <Typography variant="subtitle1" component="label" htmlFor="amount">
              Amount
            </Typography>
            <TextField
              type="number"
              defaultValue={expense?.amount}
              {...register("amount", form.amount)}
            />
          </FormControl>
          {formState.errors.amount && (
            <Typography color="error">
              {formState.errors.amount.message}
            </Typography>
          )}
          <DialogActions>
            <Button type="submit" disabled={formState.isSubmitting}>
              Save
            </Button>
          </DialogActions>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseUpdate;
