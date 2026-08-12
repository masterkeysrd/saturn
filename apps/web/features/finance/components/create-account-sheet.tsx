import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { accountSchema, type AccountFormValues } from "../schemas/account"
import {
  type Account,
  type UpdateAccountRequest,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useListCurrenciesQuery,
} from "@/gen/saturn/finance/v1/finance"
import { usePatch } from "@/hooks/use-patch"
import { InstitutionSelect } from "./institution-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  formatCents,
  toCentsString,
  ACCOUNT_COLORS,
  getAccountColors,
} from "../utils"
import { cn } from "@/lib/utils"

interface CreateAccountSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  baseCurrency: string
  editAccount: Account | null
  refetchAccounts: () => void
}

const ACCOUNT_TYPE_ITEMS = [
  { value: "BANK", label: "Bank / Checking" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "CASH", label: "Cash Holdings" },
  { value: "DIGITAL_ACCOUNT", label: "Digital Account" },
]

export function CreateAccountSheet({
  open,
  onOpenChange,
  spaceId,
  baseCurrency,
  editAccount,
  refetchAccounts,
}: CreateAccountSheetProps) {
  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: open && !!spaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies = currenciesData?.currencies || []
  const currencyItems = currencies.map((c) => ({
    value: c.code,
    label: `${c.code}${c.name ? ` (${c.name})` : ""}`,
  }))

  const createMutation = useCreateAccountMutation()
  const updateMutation = useUpdateAccountMutation()

  const patchMutation = usePatch<
    Account,
    { id: string; req: UpdateAccountRequest }
  >({
    entityKey: "accounts",
    mutationFn: (vars) => updateMutation.mutateAsync(vars),
    buildVariables: (id, payload, dirtyPaths) => ({
      id,
      req: {
        id,
        account: {
          ...editAccount,
          ...payload,
        } as Account,
        updateMask: { paths: dirtyPaths },
      },
    }),
  })

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      lastFour: "",
      type: "BANK",
      currency: baseCurrency || "USD",
      initialBalance: "0",
      creditLimit: "",
      color: "indigo",
      institutionId: "",
      isDefault: false,
      isActive: true,
      notes: "",
    },
  })

  useEffect(() => {
    if (open) {
      if (editAccount) {
        reset({
          name: editAccount.name,
          lastFour: editAccount.lastFour || "",
          type: editAccount.type,
          currency: editAccount.currency,
          initialBalance:
            editAccount.type === "CREDIT_CARD" &&
            Number(editAccount.initialBalance) < 0
              ? formatCents(
                  Math.abs(Number(editAccount.initialBalance))
                ).toString()
              : formatCents(editAccount.initialBalance).toString(),
          creditLimit: editAccount.creditLimit
            ? formatCents(editAccount.creditLimit).toString()
            : "",
          color: editAccount.color || "indigo",
          institutionId: editAccount.institutionId || "",
          isDefault: editAccount.isDefault,
          isActive: editAccount.isActive,
          notes: editAccount.notes || "",
        })
      } else {
        reset({
          name: "",
          lastFour: "",
          type: "BANK",
          currency: baseCurrency || "USD",
          initialBalance: "0",
          creditLimit: "",
          color: "indigo",
          institutionId: "",
          isDefault: false,
          isActive: true,
          notes: "",
        })
      }
    }
  }, [open, editAccount, baseCurrency, reset])

  const accountType = useWatch({ control, name: "type" })
  const currentColor = useWatch({ control, name: "color" })
  const isDefaultValue = useWatch({ control, name: "isDefault" })
  const isActiveValue = useWatch({ control, name: "isActive" })
  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    patchMutation.isPending

  const onSubmit = async (data: AccountFormValues) => {
    let centsStr = toCentsString(data.initialBalance || "0")
    if (data.type === "CREDIT_CARD") {
      const parsedVal = parseFloat(data.initialBalance || "0")
      if (parsedVal > 0) {
        centsStr = `-${centsStr}`
      }
    }

    const limitStr =
      data.type === "CREDIT_CARD" && data.creditLimit
        ? toCentsString(data.creditLimit)
        : "0"

    try {
      if (editAccount?.id) {
        await patchMutation.mutateAsync({
          id: editAccount.id,
          payload: {
            ...editAccount,
            name: data.name,
            creditLimit: limitStr,
            isDefault: data.isDefault,
            isActive: data.isActive,
            color: data.color,
            notes: data.notes || "",
            lastFour: data.lastFour || "",
            institutionId: data.institutionId || "",
          },
          dirtyFields,
        })
      } else {
        await createMutation.mutateAsync({
          account: {
            id: "",
            name: data.name,
            type: data.type,
            currency: data.currency,
            initialBalance: centsStr,
            currentBalance: "0",
            creditLimit: limitStr,
            isDefault: data.isDefault,
            isActive: true,
            color: data.color,
            notes: data.notes || "",
            lastFour: data.lastFour || "",
            institutionId: data.institutionId || "",
          },
        })
      }
      onOpenChange(false)
      refetchAccounts()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Operation failed.")
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl sm:border-l md:p-8">
        <SheetHeader className="p-0">
          <SheetTitle className="text-xl font-bold">
            {editAccount ? "Edit Account" : "Create Account"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Configure ledger entities for liquidity balance adjustments.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="acc-name"
              className="text-xs font-bold tracking-wider text-foreground uppercase"
            >
              Account Name
            </Label>
            <Input
              id="acc-name"
              placeholder="e.g. Chase Operating, Petty Cash"
              {...register("name")}
              className="h-11 rounded-xl"
            />
            {errors.name && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="acc-last-four"
              className="text-xs font-bold tracking-wider text-foreground uppercase"
            >
              Last 4 Digits (Optional)
            </Label>
            <Input
              id="acc-last-four"
              placeholder="e.g. 1234"
              {...register("lastFour")}
              className="h-11 rounded-xl"
            />
            {errors.lastFour && (
              <p className="text-[11px] font-semibold text-destructive">
                {errors.lastFour.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold tracking-wider text-foreground uppercase">
              Financial Institution
            </Label>
            <Controller
              control={control}
              name="institutionId"
              render={({ field }) => (
                <InstitutionSelect
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <FormSelect
            control={control}
            name="type"
            label="Account Type"
            disabled={!!editAccount}
            items={ACCOUNT_TYPE_ITEMS}
          />

          <FormSelect
            control={control}
            name="currency"
            label="Currency"
            disabled={!!editAccount}
            items={currencyItems}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="acc-balance"
                className="text-xs font-bold tracking-wider text-foreground uppercase"
              >
                {accountType === "CREDIT_CARD"
                  ? "Initial Balance Owed"
                  : "Initial Balance"}
              </Label>
              {accountType === "CREDIT_CARD" && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  (Positive = Debt Owed)
                </span>
              )}
            </div>
            <AmountInput
              control={control}
              name="initialBalance"
              placeholder={
                accountType === "CREDIT_CARD" ? "e.g. 450.00" : "0.00"
              }
              className="h-11 rounded-xl"
              disabled={!!editAccount}
            />
            <p className="text-[10px] text-muted-foreground">
              {accountType === "CREDIT_CARD"
                ? "Enter the amount currently owed on the card. Saturn will automatically register it as debt."
                : "Enter positive for cash/savings assets, or negative for overdraft."}
            </p>
          </div>

          {accountType === "CREDIT_CARD" && (
            <div className="animate-in space-y-2 duration-200 slide-in-from-top-2">
              <Label
                htmlFor="acc-limit"
                className="text-xs font-bold tracking-wider text-foreground uppercase"
              >
                Credit Limit
              </Label>
              <AmountInput
                control={control}
                name="creditLimit"
                placeholder="e.g. 5000.00"
                className="h-11 rounded-xl"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="mb-2 block text-xs font-bold tracking-wider text-foreground uppercase">
              Card Theme Color
            </Label>
            <div className="flex gap-2">
              {ACCOUNT_COLORS.map(
                (c: {
                  value: string
                  label: string
                  bg: string
                  border: string
                }) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setValue("color", c.value)}
                    className={cn(
                      "h-8 w-8 rounded-full border transition-all hover:scale-110",
                      getAccountColors(c.value).bg,
                      getAccountColors(c.value).border,
                      currentColor === c.value &&
                        "ring-2 ring-primary ring-offset-2 dark:ring-offset-card"
                    )}
                  />
                )
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border/40 bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label
                  htmlFor="is-default-switch"
                  className="block text-xs font-bold text-foreground"
                >
                  Set as Default Account
                </Label>
                <span className="block text-[10px] text-muted-foreground">
                  Pre-populates new transaction forms
                </span>
              </div>
              <Switch
                id="is-default-switch"
                checked={isDefaultValue}
                onCheckedChange={(checked) => setValue("isDefault", checked)}
              />
            </div>

            {editAccount && (
              <div className="flex items-center justify-between border-t border-border/20 pt-3">
                <div>
                  <Label
                    htmlFor="is-active-switch"
                    className="block text-xs font-bold text-foreground"
                  >
                    Account Active Status
                  </Label>
                  <span className="block text-[10px] text-muted-foreground">
                    Inactive accounts are hidden from transaction inputs
                  </span>
                </div>
                <Switch
                  id="is-active-switch"
                  checked={isActiveValue}
                  onCheckedChange={(checked) => setValue("isActive", checked)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="acc-notes"
              className="text-xs font-bold tracking-wider text-foreground uppercase"
            >
              Notes
            </Label>
            <Input
              id="acc-notes"
              placeholder="e.g. Swift codes, secondary card details"
              {...register("notes")}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="w-full pt-4">
            <Button
              type="submit"
              disabled={isPending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/10 transition-all"
            >
              {editAccount ? "Save Changes" : "Create Account"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
