import { useActiveSpaceContext } from "@/features/space/use-space"
import {
  useGetFinanceSettingsQuery,
  useListBudgetsQuery,
  useListExchangeRatesQuery,
  useListCurrenciesQuery,
  type ExchangeRate,
} from "@/gen/saturn/finance/v1/finance"

export function useWorkspaceFinance() {
  const { spaceId, spaceRole } = useActiveSpaceContext()
  const isWritable =
    spaceRole === "owner" ||
    spaceRole === "admin" ||
    spaceRole === "finance_manager"

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

  // 4. Fetch Supported Currencies
  const { data: currenciesData, isLoading: currenciesLoading } =
    useListCurrenciesQuery({ spaceId }, { enabled: !!spaceId })

  // Real-Time currency conversion helper
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

  const isLoading =
    settingsLoading || budgetsLoading || ratesLoading || currenciesLoading
  const isNotConfigured = !!settingsError && !settingsLoading

  return {
    spaceId,
    isWritable,
    settings,
    budgetsData,
    ratesData,
    budgets: budgetsData?.budgets || [],
    rates: ratesData?.exchangeRates || [],
    currencies: currenciesData?.currencies || [],
    isLoading,
    isNotConfigured,
    refetchSettings,
    refetchBudgets,
    refetchRates,
    getConversionPreview,
  }
}
