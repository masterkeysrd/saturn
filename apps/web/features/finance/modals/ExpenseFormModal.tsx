import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useForm, useWatch } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { TextFieldElement, SelectElement } from "react-hook-form-mui";
import { DateTime } from "luxon";
import FormNumberField from "@/components/FormNumberField";
import ExchangeRateDisplayCard from "../components/ExchangeRateDisplayCard";
import DatePickerElement from "@/components/FormDatePicker";
import FormDialog from "@/components/FormDialog";
import { money, type CurrencyCode } from "@/lib/money";
import { date } from "@/lib/date";
import { useNotify } from "@/lib/notify";
import { useNavigateBack } from "@/lib/navigate";
import {
  useBudgets,
  useTransaction,
  useCreateExpense,
  useUpdateExpense,
  useExchangeRate,
} from "../Finance.hooks";
import type { Expense } from "../Finance.model";
import FormAmountField from "../components/FormAmountField";
import { FieldMask } from "@/lib/fieldmask";
import { decimal } from "@/lib/decimal";

interface ExpenseForm {
  budgetId?: string;
  title?: string;
  description?: string;
  date?: string;
  amount?: number;
  exchangeRate?: number;
}

export function ExpenseFormModal() {
  const { id } = useParams<"id">();
  const notify = useNotify();
  const navigateBack = useNavigateBack();

  const isNew = !id;

  const [isEditingExchangeRate, setIsEditingExchangeRate] = useState(false);
  const { data: budgetsPage, isLoading: isLoadingBudgets } = useBudgets({});
  const { data: transaction, isLoading: isLoadingTransaction } =
    useTransaction(id);

  const handleClose = useCallback(() => {
    navigateBack("/finance/transactions");
  }, [navigateBack]);

  const handleSaveError = useCallback(
    (err: unknown, defaultMsg: string) => {
      console.error("Error saving expense:", err);
      notify.error(defaultMsg);
    },
    [notify],
  );

  const handleSaveSuccess = useCallback(() => {
    notify.success("Expense saved successfully");
    handleClose();
  }, [notify, handleClose]);

  const createMutation = useCreateExpense({
    onSuccess: () => handleSaveSuccess(),
    onError: (error) => handleSaveError(error, "Failed to create expense."),
  });

  const updateMutation = useUpdateExpense({
    onSuccess: () => handleSaveSuccess(),
    onError: (error) => handleSaveError(error, "Failed to update expense."),
  });

  const formValues = useMemo((): ExpenseForm => {
    if (!isNew && transaction) {
      return {
        budgetId: transaction.budget?.budgetId,
        title: transaction.title,
        description: transaction.description ?? "",
        date: date.fromPbDate(transaction.date).toISO() ?? "",
        amount: Number(transaction.amount?.cents),
        exchangeRate:
          decimal.fromPbDecimal(transaction.exchangeRate) || undefined,
      };
    }

    return {
      budgetId: "",
      title: "",
      description: "",
      date: DateTime.now().toISO() ?? "",
      amount: 0,
      exchangeRate: undefined,
    };
  }, [isNew, transaction]);

  const { control, handleSubmit, setValue, formState } = useForm<ExpenseForm>({
    values: formValues,
  });

  const selectedBudgetId = useWatch({
    control,
    name: "budgetId",
  });

  const customExchangeRate = useWatch({
    control,
    name: "exchangeRate",
  });

  const currentAmount = useWatch({
    control,
    name: "amount",
  });

  const selectedBudget = useMemo(() => {
    return budgetsPage?.budgets?.find((b) => b.id === selectedBudgetId);
  }, [budgetsPage, selectedBudgetId]);

  const {
    data: exchangeRateData,
    isLoading: isLoadingExchangeRate,
    isError: isErrorExchangeRate,
  } = useExchangeRate(selectedBudget?.amount?.currencyCode ?? "USD");

  useEffect(() => {
    const apiRate = exchangeRateData?.rate?.value
      ? Number.parseFloat(exchangeRateData.rate.value)
      : undefined;

    if (
      apiRate &&
      exchangeRateData?.rate &&
      !isEditingExchangeRate &&
      !formState.dirtyFields.exchangeRate &&
      customExchangeRate !== apiRate
    ) {
      setValue("exchangeRate", apiRate);
    }
  }, [
    exchangeRateData,
    customExchangeRate,
    isEditingExchangeRate,
    setValue,
    formState.dirtyFields,
  ]);

  const toggleExchangeRateEdit = () => {
    if (
      exchangeRateData?.rate?.value &&
      !customExchangeRate &&
      !isEditingExchangeRate
    ) {
      setValue("exchangeRate", Number.parseFloat(exchangeRateData.rate.value));
    }

    return setIsEditingExchangeRate(!isEditingExchangeRate);
  };

  const handleResetExchangeRate = () => {
    if (exchangeRateData?.rate?.value) {
      setValue("exchangeRate", parseFloat(exchangeRateData.rate.value));
      setIsEditingExchangeRate(false);
    }
  };

  const handleFormSubmit = async (data: ExpenseForm) => {
    const selectedDate = data.date
      ? DateTime.fromISO(data.date)
      : DateTime.now();

    const payload: Expense = {
      budgetId: data.budgetId ?? "",
      title: data.title ?? "",
      description: data.description,
      date: date.toPbDate(selectedDate),
      effectiveDate: date.toPbDate(selectedDate),
      amount: {
        cents: money.toCents(data.amount ?? 0),
        currencyCode: selectedBudget?.amount?.currencyCode ?? "USD",
      },
      exchangeRate: data.exchangeRate
        ? { value: data.exchangeRate.toString() }
        : undefined,
    };

    if (isNew) {
      return createMutation.mutate(payload);
    }

    const updatedFields = FieldMask.FromFormState(formState.dirtyFields);
    if (!updatedFields.hasChanges()) {
      notify.info("No changes detected. Closing form.");
      handleClose();
      return;
    }

    updateMutation.mutate({
      id: transaction?.id ?? "",
      data: payload,
    });
  };

  const displayExchangeRate =
    customExchangeRate ??
    (exchangeRateData?.rate?.value
      ? Number.parseFloat(exchangeRateData.rate.value)
      : undefined);

  const isCustomRate =
    exchangeRateData?.rate?.value &&
    customExchangeRate &&
    customExchangeRate !== Number.parseFloat(exchangeRateData.rate.value);

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
          name="budgetId"
          label="Budget"
          control={control}
          required
          disabled={isLoading || !isNew}
          options={
            budgetsPage?.budgets?.map((budget) => ({
              id: budget.id,
              label: `${budget.name} (${budget.amount?.currencyCode})`,
            })) ?? []
          }
          helperText={!isNew ? "Budget cannot be changed after creation." : ""}
        />

        {/* Currency alert */}
        {isErrorExchangeRate ? (
          <Alert variant="filled" severity="error">
            Failed to get your currency. Check if is already created.
          </Alert>
        ) : null}

        {/* Title */}
        <TextFieldElement
          name="title"
          label="Title"
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
            currency={selectedBudget?.amount?.currencyCode as CurrencyCode}
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
            loading={isLoadingExchangeRate}
            editing={isEditingExchangeRate}
            disabled={isLoading}
            amount={{
              currency: (selectedBudget?.amount?.currencyCode ??
                "USD") as CurrencyCode,
              value: currentAmount ?? 0,
            }}
            exchange={{
              currency: (selectedBudget.baseAmount?.currencyCode ??
                "USD") as CurrencyCode,
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
            name="exchangeRate"
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
