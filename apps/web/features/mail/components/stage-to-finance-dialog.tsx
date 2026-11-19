import { useEffect, useRef, useState } from "react"
import { useInRouterContext, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Receipt } from "lucide-react"
import {
  useCreateInboxItemMutation,
  useGetSettingsQuery,
  useListAccountsQuery,
  useListBudgetsQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { invalidateFinanceQueries } from "@saturn/hooks"
import { toCents, toCentsString } from "@saturn/core"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { CurrencyCombobox } from "@/features/finance/components/currency-combobox"
import { AccountSelect } from "@/features/finance/components/account-select"
import { BudgetSelect } from "@/features/finance/components/budget-select"
import { resolveSpacePath } from "@/features/space/use-space"
import type {
  StageFinanceDocType,
  StageToFinanceInitialData,
} from "../mail-utils"

const DOC_TYPE_LABELS: Record<StageFinanceDocType, string> = {
  RECEIPT: "Receipt",
  INVOICE: "Invoice",
  BANK_NOTIFICATION: "Bank Notification",
}

function RouterNavigatorSync({
  navRef,
}: {
  navRef: React.MutableRefObject<((path: string) => void) | null>
}) {
  const navigate = useNavigate()
  useEffect(() => {
    navRef.current = navigate
    return () => {
      navRef.current = null
    }
  }, [navigate, navRef])
  return null
}

export interface StageToFinanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaceId: string
  initialData: StageToFinanceInitialData | null
}

export function StageToFinanceDialog({
  open,
  onOpenChange,
  spaceId,
  initialData,
}: StageToFinanceDialogProps) {
  const inRouter = useInRouterContext()
  const navRef = useRef<((path: string) => void) | null>(null)
  const queryClient = useQueryClient()

  const { data: financeSettings } = useGetSettingsQuery(
    {},
    { enabled: open && Boolean(spaceId), retry: false }
  )
  const { data: accountsData } = useListAccountsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open && Boolean(spaceId), retry: false }
  )
  const { data: budgetsData } = useListBudgetsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: open && Boolean(spaceId), retry: false }
  )

  const createInboxItemMutation = useCreateInboxItemMutation()

  const baseCurrency = financeSettings?.baseCurrency || "USD"
  const accounts = accountsData?.accounts || []
  const budgets = budgetsData?.budgets || []

  const [vendorName, setVendorName] = useState(initialData?.vendorName || "")
  const [docType, setDocType] = useState<StageFinanceDocType>(
    initialData?.docType || "RECEIPT"
  )
  const [amountString, setAmountString] = useState(
    initialData?.amountString || ""
  )
  const [currency, setCurrency] = useState(
    initialData?.currency || baseCurrency
  )
  const [txDate, setTxDate] = useState<Date | undefined>(() => {
    if (initialData?.transactionDateIso) {
      const d = new Date(initialData.transactionDateIso)
      if (!Number.isNaN(d.getTime())) return d
    }
    return new Date()
  })
  const [accountId, setAccountId] = useState("")
  const [budgetId, setBudgetId] = useState("")
  const [errorMsg, setErrorMsg] = useState("")

  const [prevBaseCurrency, setPrevBaseCurrency] = useState(baseCurrency)
  if (prevBaseCurrency !== baseCurrency) {
    setPrevBaseCurrency(baseCurrency)
    if (initialData && !initialData.currency) {
      setCurrency(baseCurrency)
    }
  }

  // Sync state when dialog opens for a new message
  const [prevInitKey, setPrevInitKey] = useState<string | null>(null)
  const initKey = initialData
    ? `${initialData.sourceMessageId}-${open ? "open" : "closed"}`
    : null
  if (initKey && initKey !== prevInitKey) {
    setPrevInitKey(initKey)
    if (initialData) {
      setVendorName(initialData.vendorName)
      setDocType(initialData.docType)
      setAmountString(initialData.amountString)
      setCurrency(initialData.currency || baseCurrency)
      const parsed = initialData.transactionDateIso
        ? new Date(initialData.transactionDateIso)
        : new Date()
      setTxDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed)
      setAccountId("")
      setBudgetId("")
      setErrorMsg("")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!initialData) return

    const trimmedVendor = vendorName.trim()
    if (!trimmedVendor) {
      setErrorMsg("Vendor name is required.")
      return
    }
    if (toCents(amountString) <= 0) {
      setErrorMsg("Enter a positive amount.")
      return
    }

    setErrorMsg("")
    try {
      await createInboxItemMutation.mutateAsync({
        inboxItem: {
          docType,
          amount: toCentsString(amountString),
          currency: currency || baseCurrency,
          vendorName: trimmedVendor,
          transactionDate: (txDate ?? new Date()).toISOString(),
          accountId: accountId || "",
          budgetId: budgetId || "",
          scheduledTransactionId: "",
          transactionId: "",
          metadata: {
            source: "mail",
            mail_thread_id: initialData.threadId,
            mail_message_id: initialData.sourceMessageId,
            subject: initialData.subject,
          },
        },
        idempotencyKey: `mail_message:${initialData.sourceMessageId}`,
        rawPayload: initialData.rawPayload,
      })

      invalidateFinanceQueries(queryClient)
      onOpenChange(false)

      toast.add({
        title: "Staged to Finance Inbox",
        description: `${trimmedVendor} queued for review.`,
        type: "success",
        actionProps: navRef.current
          ? {
              children: "Review Inbox",
              onClick: () => {
                navRef.current?.(
                  resolveSpacePath("/finance/inbox", spaceId, true)
                )
              },
            }
          : undefined,
      })
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to stage inbox item."
      )
    }
  }

  return (
    <>
      {inRouter && <RouterNavigatorSync navRef={navRef} />}
      <FormDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Stage to Finance Inbox"
        description="Pre-fill and stage this email into your Finance Inbox for approval."
        icon={<Receipt className="h-4 w-4 text-primary" />}
        submitLabel="Stage to Finance Inbox"
        isPending={createInboxItemMutation.isPending}
        onSubmit={handleSubmit}
      >
        <div data-testid="stage-to-finance-dialog" className="space-y-4">
          {errorMsg && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {errorMsg}
            </p>
          )}

          <FormFieldItem label="Vendor" id="stage-finance-vendor">
            <Input
              id="stage-finance-vendor"
              data-testid="stage-finance-vendor-input"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Stripe"
            />
          </FormFieldItem>

          <FormFieldItem label="Document type" id="stage-finance-doc-type">
            <Select
              value={docType}
              onValueChange={(val) =>
                val && setDocType(val as StageFinanceDocType)
              }
            >
              <SelectTrigger
                id="stage-finance-doc-type"
                data-testid="stage-finance-doc-type-select"
              >
                <SelectValue>{DOC_TYPE_LABELS[docType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RECEIPT">Receipt</SelectItem>
                <SelectItem value="INVOICE">Invoice</SelectItem>
                <SelectItem value="BANK_NOTIFICATION">
                  Bank Notification
                </SelectItem>
              </SelectContent>
            </Select>
          </FormFieldItem>

          <FormFieldItem label="Amount" id="stage-finance-amount">
            <div className="grid grid-cols-[120px_1fr] gap-2.5">
              <CurrencyCombobox
                value={currency}
                onValueChange={setCurrency}
                aria-label="Currency"
              />
              <AmountInput
                id="stage-finance-amount"
                data-testid="stage-finance-amount-input"
                currency={currency}
                value={amountString}
                onValueChange={setAmountString}
                placeholder="0.00"
              />
            </div>
          </FormFieldItem>

          <FormFieldItem label="Transaction date">
            <DatePicker date={txDate} setDate={setTxDate} />
          </FormFieldItem>

          <div className="space-y-4 border-t border-border/40 pt-4">
            <FormFieldItem label="Account" optionalText="Optional">
              <AccountSelect
                accounts={accounts}
                value={accountId}
                onValueChange={setAccountId}
                allowNone
                placeholder="Select account (optional)"
              />
            </FormFieldItem>

            <FormFieldItem label="Budget" optionalText="Optional">
              <BudgetSelect
                budgets={budgets}
                value={budgetId}
                onValueChange={setBudgetId}
                allowNone
                placeholder="Select budget (optional)"
              />
            </FormFieldItem>
          </div>
        </div>
      </FormDrawer>
    </>
  )
}
