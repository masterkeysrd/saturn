import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
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
import FormDialog from "@/components/FormDialog";
import { useParams } from "react-router";
import { useNavigateBack } from "@/lib/navigate";
import FormAmountField from "../components/FormAmountField";

export function ExpenseFormModal() {
  const navigateBack = useNavigateBack();
  const { id } = useParams<"id">();
  const isNew = !id;

  const [isEditingExchangeRate, setIsEditingExchangeRate] = useState(false);
  const { data: budgets, isLoading: isLoadingBudgets } = useBudgets();
  const { data: transaction, isLoading: isLoadingTransaction } =
    useTransaction(id);

  const createMutation = useCreateExpense({
    onSuccess: () => handleSaveSuccess(),
  });

  const updateMutation = useUpdateExpense({
    onSuccess: () => handleSaveSuccess(),
  });

  const formValues = useMemo(() => {
    if (!isNew && transaction) {
      return {
        budget_id: transaction.budget_id,
        name: transaction.name,
        description: transaction.description ?? "",
        date: transaction.date,
        amount: money.toDecimal(transaction.amount?.cents ?? 0),
        exchange_rate: transaction.exchange_rate,
      };
    }

    return {
      budget_id: "",
      name: "",
      description: "",
      date: DateTime.now().toISO() ?? "",
      amount: 0,
      exchange_rate: undefined,
    };
  }, [isNew, transaction]);

  const { control, handleSubmit, setValue } = useForm<Expense>({
    values: formValues,
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
    const date = data.date ? DateTime.fromISO(data.date) : DateTime.now();

    const payload: Expense = {
      budget_id: data.budget_id,
      name: data.name,
      description: data.description,
      date: date.toISODate() || "",
      amount: money.toCents(data.amount ?? 0),
      exchange_rate: isEditingExchangeRate ? data.exchange_rate : undefined,
    };

    try {
      if (isNew) {
        await createMutation.mutateAsync(payload);
      }

      updateMutation.mutateAsync({
        id: transaction?.id ?? "",
        data: payload,
      });
    } catch (error) {
      console.error("Failed to create expense:", error);
    }
  };

  const handleSaveSuccess = () => {
    handleClose();
  };

  const handleClose = () => {
    navigateBack("/finance/transactions");
  };

  const displayExchangeRate = customExchangeRate ?? currencyData?.rate;

  const isCustomRate =
    currencyData?.rate &&
    customExchangeRate &&
    customExchangeRate !== currencyData.rate;

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLoading = isLoadingBudgets || isLoadingTransaction || isSaving;

  return (
    <FormDialog
      title={isNew ? "Create Expense" : "Edit Expense"}
      open
      onSubmit={handleSubmit(handleFormSubmit)}
      onClose={handleClose}
    >
      <FormDialog.Content>
        {/* Budget Selection */}
        <SelectElement
          name="budget_id"
          label="Budget"
          control={control}
          required
          disabled={isLoading || !isNew}
          options={
            budgets?.map((budget) => ({
              id: budget.id,
              label: `${budget.name} (${budget.amount?.currency})`,
            })) ?? []
          }
          helperText={!isNew ? "Budget cannot be changed after creation." : ""}
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
        {selectedBudget && (
          <FormAmountField
            name="amount"
            label="Amount"
            control={control}
            currency={selectedBudget?.amount?.currency}
            min={1}
            step={1}
            disabled={isLoading}
            rules={{
              required: "Amount is required",
              min: { value: 0, message: "Amount must be positive" },
            }}
          />
        )}

        {/* Converted Amount Preview */}
        {selectedBudget && displayExchangeRate && (
          <ExchangeRateDisplayCard
            loading={isLoadingCurrency}
            editing={isEditingExchangeRate}
            disabled={isLoading}
            amount={{
              currency: selectedBudget?.amount?.currency ?? "USD",
              value: currentAmount ?? 0,
            }}
            exchange={{
              currency: selectedBudget.base_amount?.currency ?? "USD",
              rate: displayExchangeRate,
            }}
            showEditButton
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
          disabled={isLoading}
          multiline
          rows={3}
          fullWidth
        />
      </FormDialog.Content>
      <FormDialog.Actions>
        <Button disabled={isSaving} onClick={handleClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isLoading || isSaving || !selectedBudget}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </FormDialog.Actions>
    </FormDialog>
  );
}
