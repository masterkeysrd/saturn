import { useState } from "react"
import { useParams } from "react-router-dom"
import { useActiveSpaceContext } from "@/features/space/use-space"
import {
  useGetFinanceSettingsQuery,
  useConfigureFinanceMutation,
  useListBudgetsQuery,
  useListExchangeRatesQuery,
  type ExchangeRate,
} from "@/gen/saturn/finance/v1/finance"
import { Button } from "@/components/ui/button"
import { Coins, Loader2, PiggyBank } from "lucide-react"
import { Label } from "@/components/ui/label"

// Import Modular Tab Sub-Views
import { BudgetsView } from "./budgets-view"
import { RatesView } from "./rates-view"
import { SettingsView } from "./settings-view"

export function FinanceView() {
  const { spaceId, spaceRole } = useActiveSpaceContext()
  const isWritable =
    spaceRole === "owner" ||
    spaceRole === "admin" ||
    spaceRole === "finance_manager"

  const { subview } = useParams()
  const activeTab = subview || "budgets"

  console.log("FinanceView Render Diagnostic:", {
    subview,
    activeTab,
    isWritable,
    spaceRole,
    spaceId,
  })

  // 1. Fetch settings
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useGetFinanceSettingsQuery(
    { spaceId },
    {
      enabled: !!spaceId,
      retry: false,
    }
  )

  // 2. Fetch budgets
  const {
    data: budgetsData,
    isLoading: budgetsLoading,
    refetch: refetchBudgets,
  } = useListBudgetsQuery(
    { spaceId, pageSize: 100, pageToken: "" },
    { enabled: !!settings }
  )

  // 3. Fetch Exchange Rates
  const {
    data: ratesData,
    isLoading: ratesLoading,
    refetch: refetchRates,
  } = useListExchangeRatesQuery(
    { spaceId, pageSize: 100, pageToken: "" },
    { enabled: !!settings }
  )

  // Settings Setup Form State
  const [setupCurrency, setSetupCurrency] = useState("USD")
  const configureMutation = useConfigureFinanceMutation()

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    await configureMutation.mutateAsync({
      space_id: spaceId,
      req: {
        spaceId,
        baseCurrency: setupCurrency,
      },
    })
    refetchSettings()
  }

  // Real-Time currency conversion helper passed down to form sheets
  const getConversionPreview = (amountStr: string, fromCurr: string) => {
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) return null
    if (!settings?.baseCurrency || fromCurr === settings.baseCurrency)
      return null

    const matchingRates =
      ratesData?.exchangeRates?.filter(
        (r: ExchangeRate) =>
          r.fromCurrency === fromCurr && r.toCurrency === settings.baseCurrency
      ) || []

    if (matchingRates.length === 0) {
      return {
        error: `No exchange rate configured from ${fromCurr} to ${settings.baseCurrency}.`,
      }
    }

    const latestRate = [...matchingRates].sort(
      (a, b) => new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
    )[0]
    return {
      amount: amount * latestRate.rate,
      rate: latestRate.rate,
      currency: settings.baseCurrency,
    }
  }

  if (settingsLoading) {
    return (
      <div className="flex min-h-[400px] flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const isNotConfigured = !!settingsError

  if (isNotConfigured) {
    return (
      <div className="flex min-h-[500px] flex-1 items-center justify-center p-6">
        <div className="relative w-full max-w-lg animate-in overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-8 shadow-2xl backdrop-blur-xl duration-500 fade-in slide-in-from-bottom-6 md:p-10">
          {/* Accent decoration */}
          <div className="absolute top-0 right-0 -mt-16 -mr-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl"></div>

          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-accent text-white shadow-xl">
            <Coins className="h-8 w-8" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            Configure Finance settings
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Select the base currency for this workspace. This will serve as your
            default reporting currency and cannot be changed later. All budgets
            will be automatically converted to this base currency for aggregate
            reporting.
          </p>

          <form onSubmit={handleSetup} className="mt-8 space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="baseCurrency"
                className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Base Currency
              </Label>
              <select
                id="baseCurrency"
                value={setupCurrency}
                onChange={(e) => setSetupCurrency(e.target.value)}
                disabled={!isWritable}
                className="flex h-12 w-full rounded-xl border border-border/60 bg-background/50 px-4 py-2 text-sm shadow-sm ring-offset-background transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="CAD">CAD - Canadian Dollar</option>
                <option value="JPY">JPY - Japanese Yen</option>
                <option value="DOP">DOP - Dominican Peso</option>
              </select>
            </div>

            <Button
              type="submit"
              disabled={configureMutation.isPending || !isWritable}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] hover:opacity-95"
            >
              {configureMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Initialize Finance Module
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-1 animate-in flex-col gap-8 p-4 duration-500 fade-in md:p-8">
      {/* Header section */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            <PiggyBank className="h-8 w-8 shrink-0 text-primary" />
            {activeTab === "settings"
              ? "Finance Settings"
              : activeTab === "rates"
                ? "Exchange Rates"
                : "Budgeting"}
          </h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {activeTab === "settings"
              ? "Configure currency rules, view currency exchanges, and check service status."
              : activeTab === "rates"
                ? "Configure daily conversions to Reporting Currency."
                : "Manage your template limits, recurrence tracking, and cross-currency allocation."}
          </p>
        </div>
      </div>

      {/* Render modular tab views */}
      {activeTab === "budgets" && (
        <BudgetsView
          spaceId={spaceId}
          isWritable={isWritable}
          settings={settings}
          budgetsData={budgetsData}
          budgetsLoading={budgetsLoading}
          refetchBudgets={refetchBudgets}
          getConversionPreview={getConversionPreview}
        />
      )}

      {activeTab === "rates" && (
        <RatesView
          spaceId={spaceId}
          isWritable={isWritable}
          settings={settings}
          ratesData={ratesData}
          ratesLoading={ratesLoading}
          refetchRates={refetchRates}
        />
      )}

      {activeTab === "settings" && (
        <SettingsView settings={settings} ratesData={ratesData} />
      )}
    </div>
  )
}

export default FinanceView
