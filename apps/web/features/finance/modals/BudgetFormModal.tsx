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
  useExchangeRates,
  useUpdateBudget,
} from "../Finance.hooks";
import type { Budget } from "../Finance.model";
import FormAmountField from "../components/FormAmountField";
import ExchangeRateDisplayCard from "../components/ExchangeRateDisplayCard";
import { FieldMask } from "@/lib/fieldmask";
import { Box, Divider, InputAdornment } from "@mui/material";
import { FormIconPicker } from "@/components/FormIconPicker";
import { FormColorPicker } from "@/components/FormColorPicker";
import { decimal } from "@/lib/decimal";

interface BudgetForm {
  name?: string;
  color?: string;
  icon_name?: string;
  currency?: CurrencyCode;
  amount?: number;
}

const useExchangeRateDropdown = () => {
  const { data: currenciesResp, isLoading: isLoadingCurrencies } =
    useCurrencies();

  const { data: exchangeRates, isLoading: isLoadingExchangeRates } =
    useExchangeRates({});

  const options = useMemo(() => {
    if (!currenciesResp || !exchangeRates) return [];

    return currenciesResp.currencies
      ?.filter((currency) =>
        exchangeRates.rates?.some(
          (rate) => rate.currencyCode === currency.code,
        ),
      )
      .map((currency) => {
        const exchangeRate = exchangeRates.rates?.find(
          (rate) => rate.currencyCode === currency.code,
        );

        return {
          id: currency.code,
          label: `${currency.name} (${currency.code})`,
          rate: decimal.fromPbDecimal(exchangeRate?.rate) ?? 1,
        };
      });
  }, [currenciesResp, exchangeRates]);

  return {
    options,
    isLoading: isLoadingCurrencies || isLoadingExchangeRates,
  };
};

export default function BudgetFormModal() {
  const { id } = useParams<"id">();
  const notify = useNotify();
  const navigateBack = useNavigateBack();

  const isNew = !id;

  const { data: budget, isLoading: isLoadingBudget } = useBudget(id);

  const { options: exchangeRateOptions, isLoading: isLoadingCurrencies } =
    useExchangeRateDropdown();

  const handleClose = useCallback(() => {
    navigateBack("/finance/budgets");
  }, [navigateBack]);

  const handleSaveSuccess = useCallback(() => {
    notify.success("Budget saved successfully");
    handleClose();
  }, [notify, handleClose]);

  const handleSaveError = useCallback(
    (err: unknown, defaultMessage: string) => {
      console.error("Error saving budget:", err);
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
        color: budget?.appearance?.color,
        icon_name: budget?.appearance?.icon,
        currency: budget.amount?.currencyCode as CurrencyCode,
        amount: money.toDecimal(budget?.amount?.cents ?? 0),
      };
    }

    return {
      icon_name: "wallet",
      color: "#2196f3",
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

  const selectedExchangeRate = useMemo(() => {
    return exchangeRateOptions.find((o) => o.id === currentCurrency);
  }, [exchangeRateOptions, currentCurrency]);

  const handleFormSubmit = async (data: BudgetForm) => {
    const payload: Budget = {
      name: data.name,
      appearance: {
        color: data.color,
        icon: data.icon_name,
      },
      amount: {
        currencyCode: isNew
          ? data.currency!
          : (budget?.amount?.currencyCode ?? "USD"),
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
          placeholder="Name"
          control={control}
          required
          disabled={isLoading}
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <FormIconPicker
                    control={control}
                    name="icon_name"
                    size={28} // picker custom prop
                    rules={{ required: true }}
                  />

                  <Divider
                    orientation="vertical"
                    flexItem
                    sx={{ ml: 1, mr: 1, height: 28 }}
                  />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Box sx={{ display: "flex", height: 24, width: 24 }}>
                    <FormColorPicker name="color" control={control} />
                  </Box>
                </InputAdornment>
              ),
            },
          }}
        />

        {/* Currency Selection */}
        <SelectElement
          name="currency"
          label="Currency"
          control={control}
          required
          disabled={isLoading || !isNew}
          options={exchangeRateOptions}
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
        {/* {selectedCurrency && ( */}
        {selectedExchangeRate && (
          <ExchangeRateDisplayCard
            loading={isLoadingCurrencies}
            disabled={isLoading}
            amount={{
              currency: (selectedExchangeRate?.id ?? "USD") as CurrencyCode,
              value: currentAmount ?? 0,
            }}
            exchange={{
              currency: "USD",
              rate: selectedExchangeRate?.rate ?? 1,
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
          disabled={isLoading || isSaving || !selectedExchangeRate}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </FormDialog.Actions>
    </FormDialog>
  );
}
