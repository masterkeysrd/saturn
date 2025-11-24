import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import { TextFieldElement, SelectElement } from "react-hook-form-mui";
import { DateTime } from "luxon";
import { money } from "@/lib/money";
import type { Expense } from "../Finance.model";
import {
  useBudgets,
  useTransaction,
  useCreateExpense,
  useUpdateExpense,
  useCurrency,
} from "../Finance.hooks";
import FormNumberField from "@/components/FormNumberField";
import ExchangeRateDisplayCard from "../components/ExchangeRateDisplayCard";
import DatePickerElement from "@/components/FormDatePicker";

export function ExpenseFormModal() {
  const [isEditingExchangeRate, setIsEditingExchangeRate] = useState(false);
  const { data: budgets, isLoading: isLoadingBudgets } = useBudgets();

  const createMutation = useCreateExpense();

  const { control, handleSubmit, setValue } = useForm<Expense>({
    defaultValues: {
      budget_id: "",
      name: "",
      description: "",
      date: DateTime.now().toString(),
      amount: 0,
      exchange_rate: undefined,
    },
  });

  const selectedBudgetId = useWatch({
    control,
    name: "budget_id",
  });

  const customExchangeRate = useWatch({
    control,
    name: "exchange_rate",
  });

  const currentAmount = useWatch({
    control,
    name: "amount",
  });

  const selectedBudget = useMemo(() => {
    return budgets?.find((b) => b.id === selectedBudgetId);
  }, [budgets, selectedBudgetId]);

  const {
    data: currencyData,
    isLoading: isLoadingCurrency,
    isError: isCurrencyError,
  } = useCurrency(selectedBudget?.amount?.currency);

  useEffect(() => {
    if (currencyData?.rate && !customExchangeRate && !isEditingExchangeRate) {
      setValue("exchange_rate", currencyData.rate);
    }
  }, [currencyData, customExchangeRate, isEditingExchangeRate, setValue]);

  const toggleExchangeRateEdit = () => {
    if (currencyData?.rate && !customExchangeRate && !isEditingExchangeRate) {
      setValue("exchange_rate", currencyData.rate);
    }

    return setIsEditingExchangeRate(!isEditingExchangeRate);
  };

  const handleResetExchangeRate = () => {
    if (currencyData?.rate) {
      setValue("exchange_rate", currencyData.rate);
      setIsEditingExchangeRate(false);
    }
  };

  const handleFormSubmit = async (data: Expense) => {
    console.log(data);
    const date = data.date ? DateTime.fromISO(data.date) : DateTime.now();

    const payload: Expense = {
      budget_id: data.budget_id,
      name: data.name,
      description: data.description,
      date: date.toISODate() || "",
      amount: money.toCents(data.amount ?? 0),
      exchange_rate: isEditingExchangeRate ? data.exchange_rate : undefined,
    };

    console.log(payload);

    try {
      await createMutation.mutateAsync(payload);
      // Add something here.
    } catch (error) {
      console.error("Failed to create expense:", error);
    }
  };

  const displayExchangeRate = customExchangeRate ?? currencyData?.rate;

  const convertedAmount = displayExchangeRate
    ? (currentAmount ?? 0) / displayExchangeRate
    : 0;

  const isCustomRate =
    currencyData?.rate &&
    customExchangeRate &&
    customExchangeRate !== currencyData.rate;

  const isLoading = isLoadingBudgets;
  const isSaving = createMutation.isPending;

  return (
    <Dialog
      open
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          component: "form",
          onSubmit: handleSubmit(handleFormSubmit),
        },
      }}
    >
      <DialogTitle>Create Expense</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Budget Selection */}
          <SelectElement
            name="budget_id"
            label="Budget"
            control={control}
            required
            disabled={isLoading}
            options={
              budgets?.map((budget) => ({
                id: budget.id,
                label: `${budget.name} (${budget.amount?.currency})`,
              })) ?? []
            }
          />

          {/* Currency alert */}
          {isCurrencyError ? (
            <Alert variant="filled" severity="error">
              Failed to get your currency. Check if is already created.
            </Alert>
          ) : null}

          {/* Name */}
          <TextFieldElement
            name="name"
            label="Name"
            control={control}
            required
            disabled={isLoading}
            fullWidth
          />

          <DatePickerElement
            name="date"
            label="Date"
            control={control}
            disabled={isLoading}
            maxDate={DateTime.now()}
            disableFuture
            required
          />

          {/* Amount */}
          <FormNumberField
            name="amount"
            label="Amount"
            control={control}
            min={1}
            step={1}
            disabled={isLoading}
            rules={{
              required: "Amount is required",
              min: { value: 0, message: "Amount must be positive" },
            }}
            startAdornment={
              selectedBudget && (
                <Typography variant="body2" fontWeight="medium">
                  {money.formatCurrency(
                    selectedBudget.amount?.currency ?? "USD",
                  )}
                </Typography>
              )
            }
          />

          {/* Converted Amount Preview */}
          {selectedBudget && displayExchangeRate && (
            <ExchangeRateDisplayCard
              loading={isLoadingCurrency}
              editing={isEditingExchangeRate}
              disabled={isLoading}
              amount={{
                currency: selectedBudget?.amount?.currency ?? "USD",
                value: convertedAmount,
              }}
              exchange={{
                currency: selectedBudget.base_amount?.currency ?? "USD",
                rate: displayExchangeRate,
              }}
              showResetButton={Boolean(isCustomRate)}
              onToggleEdit={toggleExchangeRateEdit}
              onReset={handleResetExchangeRate}
            />
          )}

          {/*Exchange rate field*/}
          {isEditingExchangeRate && (
            <FormNumberField
              name="exchange_rate"
              control={control}
              label="Custom Exchange Rate"
              min={0}
              step={0.01}
              decimalPlaces={4}
              helperText="Override the default exchange rate"
              fullWidth
            />
          )}

          {/* Description */}
          <TextFieldElement
            name="description"
            label="Description"
            control={control}
            multiline
            rows={3}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={isSaving}>Cancel</Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isLoading || isSaving || !selectedBudget}
        >
          {isSaving ? "Saving..." : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
