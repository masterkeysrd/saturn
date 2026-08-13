import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { borrowingSchema, type BorrowingFormValues } from "../schemas/borrowing"
import {
  type Borrowing,
  useCreateBorrowingMutation,
  useUpdateBorrowingMutation,
  useListCurrenciesQuery,
} from "@/gen/saturn/finance/v1/finance"
import { useCurrencyConversionPreview } from "@/hooks/use-currency-conversion"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import { Input } from "@/components/ui/input"
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

const DIRECTION_ITEMS = [
  { value: "LENT", label: "Lent (Someone owes me)" },
  { value: "BORROWED", label: "Borrowed (I owe someone)" },
]

export function CreateBorrowingSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  editBorrowing,
  refetchBorrowings,
}: CreateBorrowingSheetProps) {
  const queryClient = useQueryClient()
  const createBorrowingMutation = useCreateBorrowingMutation()
  const updateBorrowingMutation = useUpdateBorrowingMutation()

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
  }))

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<BorrowingFormValues>({
    resolver: zodResolver(borrowingSchema),
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
  })

  useEffect(() => {
    if (open) {
      if (editBorrowing) {
        const estDate = editBorrowing.establishedAt
          ? new Date(editBorrowing.establishedAt)
          : new Date()
        const dueDate = editBorrowing.dueAt
          ? new Date(editBorrowing.dueAt)
          : undefined

        reset({
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
        })
      } else {
        reset({
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
        })
      }
    }
  }, [open, editBorrowing, baseCurrency, reset])

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
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to save borrowing", err)
    }
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={editBorrowing ? "Edit Debt Agreement" : "Log Debt Agreement"}
      description={
        editBorrowing
          ? "Modify logged lending or borrowing agreement details. Saturn will recompute general ledger entries automatically."
          : "Track personal money lent to or borrowed from contacts. Optionally post initial balance movement to a payment account."
      }
      submitLabel={editBorrowing ? "Save Changes" : "Create Record"}
      isPending={isPending}
      disabled={!!(conversion && "error" in conversion)}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormSelect
        control={control}
        name="direction"
        label="Type"
        items={DIRECTION_ITEMS}
      />

      <FormFieldItem label="Name" error={errors.counterparty?.message}>
        <Input
          placeholder="e.g. Uncle Bob, John Doe"
          {...register("counterparty")}
          className="h-12 rounded-xl border-border/60 bg-background/50"
        />
      </FormFieldItem>

      <FormFieldItem label="Contact Info (Optional)">
        <Input
          placeholder="e.g. bob@email.com, +1 234..."
          {...register("contactInfo")}
          className="h-12 rounded-xl border-border/60 bg-background/50"
        />
      </FormFieldItem>

      <FormFieldItem label="Amount" error={errors.amount?.message}>
        <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
          <AmountInput
            control={control}
            name="amount"
            placeholder="0.00"
            showError={false}
            className="h-full w-full flex-1 border-0 bg-transparent px-4 py-2 text-sm text-foreground shadow-none ring-0 focus-visible:ring-0 focus-visible:outline-none"
          />

          <div className="h-6 w-px shrink-0 bg-border/40" />

          <FormSelect
            control={control}
            name="currency"
            items={currencyItems}
            triggerClassName="!h-full w-28 border-0 bg-transparent focus-visible:ring-0"
          />
        </div>
      </FormFieldItem>

      <FormFieldItem label="Date Established">
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
            Set a target due date
          </Label>
        </div>
        {hasDueDateValue && (
          <FormFieldItem
            label="Due Date"
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
            ? "Sync change to linked bank transaction"
            : "Register as bank transaction"}
        </Label>
      </div>

      <FormFieldItem label="Notes">
        <textarea
          placeholder="Add extra context..."
          {...register("notes")}
          rows={3}
          className="flex min-h-[90px] w-full rounded-xl border border-border/60 bg-background/50 px-3.5 py-2.5 text-sm text-foreground transition-all outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
      </FormFieldItem>

      <CurrencyConversionPreview
        conversion={conversion}
        fromCurrency={currencyValue}
      />
    </FormDrawer>
  )
}
