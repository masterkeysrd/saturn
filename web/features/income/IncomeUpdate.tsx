import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useNavigate, useParams } from "react-router";
import { useForm } from "react-hook-form";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";

import money from "../../lib/money";

import { Income } from "./Income.model";
import { createIncome, getIncome, updateIncome } from "./Income.service";
import FormTextField from "../../components/FormTextField";
import Form from "../../components/Form";

const form = {
  name: {
    required: "Name is required",
    maxLength: { value: 100, message: "Description is too long" },
  },
  amount: {
    required: "Amount is required",
    min: { value: 1, message: "Amount must be greater than 0" },
  },
};

export const IncomeUpdate = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { id } = useParams<"id">();
  const isNew = id === undefined;
  const title = isNew ? "Create Income" : "Edit Income";

  const queryClient = useQueryClient();

  const { data: income, isLoading: isLoadingIncome } = useQuery({
    queryKey: ["income", id],
    queryFn: () => getIncome(id!),
    enabled: !isNew,
  });

  const createIncomeMutation = useMutation({
    mutationFn: createIncome,
    onSuccess: () => handleSaveSuccess(),
  });

  const updateIncomeMutation = useMutation({
    mutationFn: updateIncome,
    onSuccess: () => handleSaveSuccess(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Income>({
    mode: "onSubmit",
    values: isNew
      ? {
          name: "",
          amount: 0,
        }
      : {
          ...income,
          amount: money.fromCents(income?.amount),
        },
  });

  const onSubmit = async (data: Income) => {
    const payload = {
      ...data,
      amount: money.toCents(data.amount),
    };

    if (isNew) {
      createIncomeMutation.mutateAsync(payload);
    } else {
      updateIncomeMutation.mutateAsync(payload);
    }
  };

  const handleClose = () => {
    navigate("/income");
  };

  const handleSaveSuccess = () => {
    queryClient.invalidateQueries({
      queryKey: ["incomes"],
    });
    enqueueSnackbar("Income saved successfully", { variant: "success" });
    navigate("/income");
  };

  if (isLoadingIncome) {
    return <div>Loading...</div>;
  }

  return (
    <Dialog open>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ width: 400 }}>
        <Form onSubmit={handleSubmit(onSubmit)}>
          <FormTextField
            label="Name"
            fullWidth
            {...register("name", form.name)}
            error={errors.name}
          />
          <FormTextField
            label="Amount"
            type="number"
            fullWidth
            {...register("amount", form.amount)}
            error={errors.amount}
          />
          <DialogActions sx={{ mt: 2 }}>
            <Button variant="contained" color="error" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="contained" color="primary" type="submit">
              Save
            </Button>
          </DialogActions>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default IncomeUpdate;
