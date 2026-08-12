import { useEffect } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FormSelect } from "@/components/ui/form-select"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
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
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
    buildVariables: (id, payload, _dirtyPaths, expectedVersion) => ({
      id,
      req: {
        id,
        account: payload as Account,
        version: expectedVersion,
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
          expectedVersion: editAccount.version,
          payload: {
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
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={editAccount ? "Edit Account" : "Create Account"}
      description="Configure ledger entities for liquidity balance adjustments."
      submitLabel={editAccount ? "Save Changes" : "Create Account"}
      isPending={isPending}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormFieldItem label="Account Name" error={errors.name?.message}>
        <Input
          placeholder="e.g. Chase Operating, Petty Cash"
          {...register("name")}
          className="h-11 rounded-xl"
        />
      </FormFieldItem>

      <FormFieldItem
        label="Last 4 Digits (Optional)"
        error={errors.lastFour?.message}
      >
        <Input
          placeholder="e.g. 1234"
          {...register("lastFour")}
          className="h-11 rounded-xl"
        />
      </FormFieldItem>

      <FormFieldItem label="Financial Institution">
        <Controller
          control={control}
          name="institutionId"
          render={({ field }) => (
            <InstitutionSelect value={field.value} onChange={field.onChange} />
          )}
        />
      </FormFieldItem>

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

      <FormFieldItem
        label={
          accountType === "CREDIT_CARD"
            ? "Initial Balance Owed"
            : "Initial Balance"
        }
        optionalText={
          accountType === "CREDIT_CARD" ? "(Positive = Debt Owed)" : undefined
        }
        subtext={
          accountType === "CREDIT_CARD"
            ? "Enter the amount currently owed on the card. Saturn will automatically register it as debt."
            : "Enter positive for cash/savings assets, or negative for overdraft."
        }
      >
        <AmountInput
          control={control}
          name="initialBalance"
          placeholder={accountType === "CREDIT_CARD" ? "e.g. 450.00" : "0.00"}
          className="h-11 rounded-xl"
          disabled={!!editAccount}
        />
      </FormFieldItem>

      {accountType === "CREDIT_CARD" && (
        <FormFieldItem
          label="Credit Limit"
          className="animate-in duration-200 slide-in-from-top-2"
        >
          <AmountInput
            control={control}
            name="creditLimit"
            placeholder="e.g. 5000.00"
            className="h-11 rounded-xl"
          />
        </FormFieldItem>
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
                onClick={() =>
                  setValue("color", c.value, { shouldDirty: true })
                }
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
            onCheckedChange={(checked) =>
              setValue("isDefault", checked, { shouldDirty: true })
            }
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
              onCheckedChange={(checked) =>
                setValue("isActive", checked, { shouldDirty: true })
              }
            />
          </div>
        )}
      </div>

      <FormFieldItem label="Notes">
        <Input
          placeholder="e.g. Swift codes, secondary card details"
          {...register("notes")}
          className="h-11 rounded-xl"
        />
      </FormFieldItem>
    </FormDrawer>
  )
}
