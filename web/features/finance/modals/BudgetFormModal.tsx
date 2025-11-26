import { useCallback, useMemo } from "react";
import { useParams } from "react-router";
import { useForm, useWatch } from "react-hook-form";
import Button from "@mui/material/Button";
import { SelectElement, TextFieldElement } from "react-hook-form-mui";

import FormDialog from "@/components/FormDialog";
import { useNotify } from "@/lib/notify";
import { money, type CurrencyCode } from "@/lib/money";
import { useNavigateBack } from "@/lib/navigate";

import {
  useBudget,
  useCreateBudget,
  useCurrencies,
  useUpdateBudget,
} from "../Finance.hooks";
import type { Budget } from "../Finance.model";
import FormAmountField from "../components/FormAmountField";
import ExchangeRateDisplayCard from "../components/ExchangeRateDisplayCard";
import { FieldMask } from "@/lib/fieldmask";

interface BudgetForm {
  name?: string;
  currency?: CurrencyCode;
  amount?: number;
}

export default function BudgetFormModal() {
  const { id } = useParams<"id">();
  const notify = useNotify();
  const navigateBack = useNavigateBack();

  const isNew = !id;

  const { data: budget, isLoading: isLoadingBudget } = useBudget(id);
  const { data: currenciesResp, isLoading: isLoadingCurrencies } =
    useCurrencies();

  const handleClose = useCallback(() => {
    navigateBack("/finance/budgets");
  }, [navigateBack]);

  const handleSaveSuccess = useCallback(() => {
    notify.success("Budget saved successfully");
    handleClose();
  }, [notify, handleClose]);

  const handleSaveError = useCallback(
    (_: unknown, defaultMessage: string) => {
      notify.error(defaultMessage);
    },
    [notify],
  );

  const createMutation = useCreateBudget({
    onSuccess: handleSaveSuccess,
    onError: (error) => handleSaveError(error, "Failed to create budget."),
  });

  const updateMutation = useUpdateBudget({
    onSuccess: handleSaveSuccess,
    onError: (error) => handleSaveError(error, "Failed to update budget."),
  });

  const formValues: BudgetForm = useMemo(() => {
    if (!isNew && budget) {
      return {
        name: budget.name,
        currency: budget.amount?.currency,
        amount: money.toDecimal(budget?.amount?.cents ?? 0),
      };
    }

    return {
      name: "",
      currency: "" as CurrencyCode,
      amount: 0,
    };
  }, [isNew, budget]);

  const { control, handleSubmit, formState } = useForm<BudgetForm>({
    values: formValues,
  });

  const currentCurrency = useWatch({
    control,
    name: "currency",
  });

  const currentAmount = useWatch({
    control,
    name: "amount",
  });

  const selectedCurrency = useMemo(() => {
    return currenciesResp?.currencies?.find((b) => b.code === currentCurrency);
  }, [currenciesResp, currentCurrency]);

  const handleFormSubmit = async (data: BudgetForm) => {
    const payload: Budget = {
      name: data.name,
      amount: {
        currency: isNew ? data.currency! : (budget?.amount?.currency ?? "USD"),
        cents: money.toCents(data.amount ?? 0),
      },
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
      id: budget?.id ?? "",
      data: payload,
      params: { update_mask: updatedFields.toString() },
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLoading = isLoadingBudget || isSaving;

  return (
    <FormDialog
      title={isNew ? "Create Budget" : "Edit Expense"}
      open
      onSubmit={handleSubmit(handleFormSubmit)}
      onClose={handleClose}
    >
      <FormDialog.Content>
        {/* Name */}
        <TextFieldElement
          name="name"
          label="Name"
          control={control}
          required
          disabled={isLoading}
          fullWidth
        />

        {/* Currency Selection */}
        <SelectElement
          name="currency"
          label="Currency"
          control={control}
          required
          disabled={isLoading || !isNew}
          options={
            currenciesResp?.currencies?.map((currency) => ({
              id: currency.code,
              label: currency.name,
            })) ?? []
          }
          helperText={!isNew ? "Budget cannot be changed after creation." : ""}
        />

        {/* Amount */}
        <FormAmountField
          name="amount"
          label="Amount"
          control={control}
          min={1}
          step={1}
          currency={currentCurrency}
          disabled={isLoading}
          rules={{
            required: "Amount is required",
            min: { value: 0, message: "Amount must be positive" },
          }}
        />

        {/* Converted Amount Preview */}
        {selectedCurrency && (
          <ExchangeRateDisplayCard
            loading={isLoadingCurrencies}
            disabled={isLoading}
            amount={{
              currency: selectedCurrency?.code ?? "USD",
              value: currentAmount ?? 0,
            }}
            exchange={{
              currency: "USD",
              rate: selectedCurrency.rate ?? 0,
            }}
          />
        )}
      </FormDialog.Content>
      <FormDialog.Actions>
        <Button disabled={isSaving} onClick={handleClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={isLoading || isSaving || !selectedCurrency}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </FormDialog.Actions>
    </FormDialog>
  );
}
