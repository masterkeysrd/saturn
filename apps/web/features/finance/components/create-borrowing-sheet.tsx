import { useMemo } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { useI18n } from "@saturn/hooks"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { BorrowingSchema, type BorrowingFormValues } from "@saturn/schemas"
import {
  type Borrowing,
  useCreateBorrowingMutation,
  useUpdateBorrowingMutation,
  useListCurrenciesQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AmountInput } from "@/components/ui/amount-input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { toCentsString, formatCents } from "../utils"

interface CreateBorrowingSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId?: string
  baseCurrency?: string
  editBorrowing?: Borrowing | null
  refetchBorrowings?: () => void
}

const DIRECTION_VALUES = ["LENT", "BORROWED"] as const

export function CreateBorrowingSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  editBorrowing,
  refetchBorrowings,
}: CreateBorrowingSheetProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const createBorrowingMutation = useCreateBorrowingMutation()
  const updateBorrowingMutation = useUpdateBorrowingMutation()

  const directionItems = useMemo(
    () =>
      DIRECTION_VALUES.map((value) => ({
        value,
        label:
          value === "LENT"
            ? t("finance.borrowing.sheet.directionLent")
            : t("finance.borrowing.sheet.directionBorrowed"),
      })),
    [t]
  )

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId,
    enabled: open,
    baseCurrency,
  })

  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const currencyItems = currencies.map((c) => ({
    value: c.code,
    label: `${c.code}${c.name ? ` (${c.name})` : ""}`,
    triggerLabel: c.code,
  }))

  const borrowingDefaultValues = useMemo<BorrowingFormValues>(() => {
    if (editBorrowing) {
      const estDate = editBorrowing.establishedAt
        ? new Date(editBorrowing.establishedAt)
        : new Date()
      const dueDate = editBorrowing.dueAt
        ? new Date(editBorrowing.dueAt)
        : undefined

      return {
        direction: editBorrowing.direction || "LENT",
        counterparty: editBorrowing.counterparty || "",
        contactInfo: editBorrowing.contactInfo || "",
        amount: formatCents(editBorrowing.totalAmount).toString(),
        currency: editBorrowing.currency || baseCurrency || "USD",
        establishedAt: estDate,
        dueAt: dueDate,
        hasDueDate: !!dueDate,
        createAsTransaction: !!editBorrowing.accountId,
        notes: editBorrowing.notes || "",
      }
    }
    return {
      direction: "LENT",
      counterparty: "",
      contactInfo: "",
      amount: "",
      currency: baseCurrency || "USD",
      establishedAt: new Date(),
      dueAt: undefined,
      hasDueDate: false,
      createAsTransaction: false,
      notes: "",
    }
  }, [editBorrowing, baseCurrency])

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<BorrowingFormValues>({
    resolver: zodResolver(BorrowingSchema),
    defaultValues: {
      direction: "LENT",
      counterparty: "",
      contactInfo: "",
      amount: "",
      currency: baseCurrency || "USD",
      establishedAt: new Date(),
      dueAt: undefined,
      hasDueDate: false,
      createAsTransaction: false,
      notes: "",
    },
    values: borrowingDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  const amountValue = useWatch({ control, name: "amount" })
  const currencyValue = useWatch({ control, name: "currency" })
  const hasDueDateValue = useWatch({ control, name: "hasDueDate" })
  const createAsTxValue = useWatch({ control, name: "createAsTransaction" })

  const isPending =
    createBorrowingMutation.isPending || updateBorrowingMutation.isPending

  const conversion = getConversionPreview(amountValue, currencyValue)

  const onSubmit = async (data: BorrowingFormValues) => {
    const borrowingPayload = {
      direction: data.direction,
      counterparty: data.counterparty,
      contactInfo: data.contactInfo || "",
      totalAmount: toCentsString(data.amount),
      currency: data.currency,
      establishedAt: data.establishedAt.toISOString(),
      dueAt:
        data.hasDueDate && data.dueAt ? data.dueAt.toISOString() : undefined,
      notes: data.notes || "",
      status: editBorrowing?.status || "ACTIVE",
      createAsTransaction: data.createAsTransaction,
    }

    try {
      if (editBorrowing) {
        await updateBorrowingMutation.mutateAsync({
          id: editBorrowing.id || "",
          req: {
            id: editBorrowing.id || "",
            borrowing: borrowingPayload,
          },
        })
      } else {
        await createBorrowingMutation.mutateAsync({
          borrowing: borrowingPayload,
        })
      }
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/transactions"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/accounts"],
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/borrowings"],
      })
      refetchBorrowings?.()
      reset()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to save borrowing", err)
    }
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        editBorrowing
          ? t("finance.borrowing.sheet.editTitle")
          : t("finance.borrowing.sheet.createTitle")
      }
      description={
        editBorrowing
          ? t("finance.borrowing.sheet.editDescription")
          : t("finance.borrowing.sheet.createDescription")
      }
      submitLabel={
        editBorrowing
          ? t("finance.borrowing.sheet.saveSubmit")
          : t("finance.borrowing.sheet.createSubmit")
      }
      isPending={isPending}
      disabled={!!(conversion && "error" in conversion)}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormSelect
        control={control}
        name="direction"
        label={t("finance.borrowing.sheet.typeLabel")}
        items={directionItems}
      />

      <FormFieldItem
        label={t("finance.borrowing.sheet.nameLabel")}
        error={errors.counterparty?.message}
      >
        <Input
          placeholder={t("finance.borrowing.sheet.namePlaceholder")}
          {...register("counterparty")}
        />
      </FormFieldItem>

      <FormFieldItem label={t("finance.borrowing.sheet.contactLabel")}>
        <Input
          placeholder={t("finance.borrowing.sheet.contactPlaceholder")}
          {...register("contactInfo")}
        />
      </FormFieldItem>

      <FormFieldItem
        label={t("finance.borrowing.sheet.amountLabel")}
        error={errors.amount?.message}
      >
        <div className="flex h-10 items-center overflow-hidden rounded-lg border border-border bg-control shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
          <AmountInput
            control={control}
            name="amount"
            placeholder="0.00"
            showError={false}
            className="h-full w-full flex-1 rounded-none border-0 bg-transparent px-3 py-1.5 text-sm text-foreground shadow-none ring-0 focus-visible:ring-0 focus-visible:outline-none"
          />

          <div className="h-5 w-px shrink-0 bg-border/70" />

          <FormSelect
            control={control}
            name="currency"
            items={currencyItems}
            triggerClassName="h-full w-24 shrink-0 rounded-none border-0 bg-transparent px-3 font-mono text-xs font-medium shadow-none hover:bg-muted/40 focus-visible:ring-0"
          />
        </div>
      </FormFieldItem>

      <FormFieldItem label={t("finance.borrowing.sheet.establishedLabel")}>
        <Controller
          control={control}
          name="establishedAt"
          render={({ field }) => (
            <DatePicker
              date={field.value}
              setDate={(d) => d && field.onChange(d)}
            />
          )}
        />
      </FormFieldItem>

      <div className="space-y-3.5 pt-1">
        <div className="flex items-center gap-2.5 select-none">
          <Checkbox
            id="hasDueDate"
            checked={hasDueDateValue}
            onCheckedChange={(checked) =>
              setValue("hasDueDate", !!checked, { shouldDirty: true })
            }
          />
          <Label
            htmlFor="hasDueDate"
            className="cursor-pointer text-xs font-semibold text-foreground/80"
          >
            {t("finance.borrowing.sheet.setDueDate")}
          </Label>
        </div>
        {hasDueDateValue && (
          <FormFieldItem
            label={t("finance.borrowing.sheet.dueDateLabel")}
            className="slide-in-from-top-1.5 animate-in duration-200"
          >
            <Controller
              control={control}
              name="dueAt"
              render={({ field }) => (
                <DatePicker
                  date={field.value}
                  setDate={(d) => field.onChange(d)}
                />
              )}
            />
          </FormFieldItem>
        )}
      </div>

      <div className="flex items-center gap-2.5 pt-1 select-none">
        <Checkbox
          id="createAsTransaction"
          checked={createAsTxValue}
          onCheckedChange={(checked) =>
            setValue("createAsTransaction", !!checked, { shouldDirty: true })
          }
        />
        <Label
          htmlFor="createAsTransaction"
          className="cursor-pointer text-xs font-semibold text-foreground/80"
        >
          {editBorrowing
            ? t("finance.borrowing.sheet.syncChange")
            : t("finance.borrowing.sheet.registerAsTx")}
        </Label>
      </div>

      <FormFieldItem label={t("finance.borrowing.sheet.notesLabel")}>
        <Textarea
          placeholder={t("finance.borrowing.sheet.notesPlaceholder")}
          {...register("notes")}
          rows={3}
        />
      </FormFieldItem>

      <CurrencyConversionPreview
        conversion={conversion}
        fromCurrency={currencyValue}
      />
    </FormDrawer>
  )
}
