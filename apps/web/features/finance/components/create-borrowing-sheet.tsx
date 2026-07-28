import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useCreateBorrowingMutation,
  useUpdateBorrowingMutation,
  type Borrowing,
  useListCurrenciesQuery,
  useListExchangeRatesQuery,
  type ExchangeRate,
} from "@/gen/saturn/finance/v1/finance"
import { useActiveSpaceContext } from "@/features/space/use-space"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { FormSelect } from "@/components/ui/form-select"
import { Loader2 } from "lucide-react"
import { toCentsString, formatCents } from "../utils"
import { DatePicker } from "@/components/ui/date-picker"
import { CurrencyConversionPreview } from "./currency-conversion-preview"
import {
  borrowingSchema,
  type BorrowingFormValues,
} from "../schemas/borrowing"

const DIRECTION_ITEMS = [
  { value: "LENT", label: "I Lent Money" },
  { value: "BORROWED", label: "I Borrowed Money" },
]

interface CreateBorrowingSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  baseCurrency: string
  editBorrowing?: Borrowing | null
  refetchBorrowings: () => void
}

export function CreateBorrowingSheet({
  open,
  onOpenChange,
  baseCurrency,
  editBorrowing,
  refetchBorrowings,
}: CreateBorrowingSheetProps) {
  const { spaceId } = useActiveSpaceContext()

  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []

  const { data: ratesData } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open && !!spaceId }
  )

  const getConversionPreview = (amountStr: string, fromCurr: string) => {
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) return null
    if (!baseCurrency || fromCurr === baseCurrency) return null

    const matchingRates =
      ratesData?.exchangeRates?.filter(
        (r: ExchangeRate) =>
          r.fromCurrency === fromCurr && r.toCurrency === baseCurrency
      ) || []

    if (matchingRates.length === 0) return null

    const latestRate = [...matchingRates].sort(
      (a, b) => new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
    )[0]
    return {
      amount: amount * latestRate.rate,
      rate: latestRate.rate,
      currency: baseCurrency,
    }
  }

  const fallbackCurrencies: Array<{ code: string; name?: string }> = [
    { code: "USD" },
    { code: "EUR" },
    { code: "GBP" },
    { code: "CAD" },
    { code: "DOP" },
  ]
  const currencyList =
    currencies && currencies.length > 0 ? currencies : fallbackCurrencies

  const currencyItems = currencyList.map((cur) => ({
    value: cur.code,
    label: `${cur.code}${cur.name ? ` (${cur.name})` : ""}`,
  }))

  const createBorrowingMutation = useCreateBorrowingMutation()
  const updateBorrowingMutation = useUpdateBorrowingMutation()

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
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
      hasDueDate: false,
      dueAt: undefined,
      notes: "",
      createAsTransaction: true,
    },
  })

  useEffect(() => {
    if (open) {
      if (editBorrowing) {
        reset({
          direction: editBorrowing.direction || "LENT",
          counterparty: editBorrowing.counterparty || "",
          contactInfo: editBorrowing.contactInfo || "",
          amount: formatCents(editBorrowing.totalAmount).toString(),
          currency: editBorrowing.currency || baseCurrency || "USD",
          establishedAt: editBorrowing.establishedAt
            ? new Date(editBorrowing.establishedAt)
            : new Date(),
          hasDueDate: !!editBorrowing.dueAt,
          dueAt: editBorrowing.dueAt ? new Date(editBorrowing.dueAt) : undefined,
          notes: editBorrowing.notes || "",
          createAsTransaction: editBorrowing.createAsTransaction ?? false,
        })
      } else {
        reset({
          direction: "LENT",
          counterparty: "",
          contactInfo: "",
          amount: "",
          currency: baseCurrency || "USD",
          establishedAt: new Date(),
          hasDueDate: false,
          dueAt: undefined,
          notes: "",
          createAsTransaction: true,
        })
      }
    }
  }, [open, editBorrowing, baseCurrency, reset])

  const amountValue = watch("amount")
  const currencyValue = watch("currency")
  const hasDueDateValue = watch("hasDueDate")
  const createAsTxValue = watch("createAsTransaction")

  const conversion = createAsTxValue
    ? getConversionPreview(amountValue, currencyValue)
    : null

  const isPending =
    createBorrowingMutation.isPending || updateBorrowingMutation.isPending

  const onSubmit = async (data: BorrowingFormValues) => {
    const cents = parseInt(toCentsString(data.amount))
    if (isNaN(cents) || cents <= 0) return

    const borrowingPayload = {
      direction: data.direction,
      counterparty: data.counterparty,
      contactInfo: data.contactInfo || "",
      totalAmount: cents.toString(),
      currency: data.currency,
      status: editBorrowing?.status || "ACTIVE",
      establishedAt: data.establishedAt.toISOString(),
      dueAt: (data.hasDueDate && data.dueAt
        ? data.dueAt.toISOString()
        : undefined) as unknown as string,
      notes: data.notes || "",
      createAsTransaction: !editBorrowing ? data.createAsTransaction : false,
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
      refetchBorrowings()
      onOpenChange(false)
    } catch (err) {
      console.error("Failed to save borrowing", err)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:max-w-lg sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold tracking-tight">
            {editBorrowing ? "Edit Debt Agreement" : "Log Debt Agreement"}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {editBorrowing
              ? "Modify logged lending or borrowing agreement details. Saturn will recompute general ledger entries automatically."
              : "Track personal money lent to or borrowed from contacts. Optionally post initial balance movement to a payment account."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          <FormSelect
            control={control}
            name="direction"
            label="Type"
            items={DIRECTION_ITEMS}
          />

          <div className="space-y-2">
            <Label
              htmlFor="counterparty"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Name
            </Label>
            <Input
              id="counterparty"
              placeholder="e.g. Uncle Bob, John Doe"
              {...register("counterparty")}
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
            {errors.counterparty && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.counterparty.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="contactInfo"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Contact Info (Optional)
            </Label>
            <Input
              id="contactInfo"
              placeholder="e.g. bob@email.com, +1 234..."
              {...register("contactInfo")}
              className="h-12 rounded-xl border-border/60 bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="amount"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Amount
            </Label>
            <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border/60 bg-background/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                {...register("amount")}
                className="h-full w-full flex-1 bg-transparent px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />

              <div className="h-6 w-px shrink-0 bg-border/40" />

              <FormSelect
                control={control}
                name="currency"
                items={currencyItems}
                triggerClassName="!h-full w-28 border-0 bg-transparent focus-visible:ring-0"
              />
            </div>
            {errors.amount && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.amount.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Date Established
            </Label>
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
          </div>

          <div className="space-y-3.5 pt-1">
            <div className="flex items-center gap-2.5 select-none">
              <Checkbox
                id="hasDueDate"
                checked={hasDueDateValue}
                onCheckedChange={(checked) => setValue("hasDueDate", !!checked)}
              />
              <Label
                htmlFor="hasDueDate"
                className="cursor-pointer text-xs font-semibold text-foreground/80"
              >
                Set a target due date
              </Label>
            </div>
            {hasDueDateValue && (
              <div className="slide-in-from-top-1.5 animate-in space-y-2 duration-200 fade-in">
                <Label className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  Due Date
                </Label>
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
              </div>
            )}
          </div>

          {!editBorrowing && (
            <div className="flex items-center gap-2.5 pt-1 select-none">
              <Checkbox
                id="createAsTransaction"
                checked={createAsTxValue}
                onCheckedChange={(checked) =>
                  setValue("createAsTransaction", !!checked)
                }
              />
              <Label
                htmlFor="createAsTransaction"
                className="cursor-pointer text-xs font-semibold text-foreground/80"
              >
                Create as transaction
              </Label>
            </div>
          )}

          <div className="space-y-2">
            <Label
              htmlFor="notes"
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Notes
            </Label>
            <textarea
              id="notes"
              placeholder="Add extra context..."
              {...register("notes")}
              rows={3}
              className="flex min-h-[90px] w-full rounded-xl border border-border/60 bg-background/50 px-3.5 py-2.5 text-sm text-foreground transition-all outline-none placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <CurrencyConversionPreview
            conversion={conversion}
            fromCurrency={currencyValue}
          />

          <Button
            type="submit"
            className="mt-8 h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] hover:opacity-95"
            disabled={isPending || !!(conversion && "error" in conversion)}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editBorrowing ? "Save Changes" : "Create Record"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
