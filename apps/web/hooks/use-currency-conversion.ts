import {
  useListExchangeRatesQuery,
  type ExchangeRate,
} from "@/gen/saturn/finance/v1/finance"

export interface ConversionPreviewSuccess {
  amount: number
  rate: number
  currency: string
}

export interface ConversionPreviewError {
  error: string
}

export type ConversionPreviewResult =
  ConversionPreviewSuccess | ConversionPreviewError

export function useCurrencyConversionPreview({
  spaceId,
  enabled = true,
  baseCurrency,
}: {
  spaceId?: string
  enabled?: boolean
  baseCurrency?: string
}) {
  const { data: ratesData, isLoading } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: enabled && !!spaceId }
  )

  const exchangeRates = ratesData?.exchangeRates || []

  const getConversionPreview = (
    amountStr?: string,
    fromCurrency?: string
  ): ConversionPreviewResult | null => {
    if (!amountStr || !fromCurrency || !baseCurrency) return null
    const amount = parseFloat(amountStr)
    if (isNaN(amount)) return null
    if (fromCurrency === baseCurrency) return null

    if (amount === 0) {
      return {
        amount: 0,
        rate: 1,
        currency: baseCurrency,
      }
    }

    const matchingRates = exchangeRates.filter(
      (r: ExchangeRate) =>
        r.fromCurrency === fromCurrency && r.toCurrency === baseCurrency
    )

    if (matchingRates.length === 0) {
      return {
        error: `No exchange rate configured from ${fromCurrency} to ${baseCurrency}.`,
      }
    }

    const latestRate = [...matchingRates].sort(
      (a, b) => new Date(b.rateDate).getTime() - new Date(a.rateDate).getTime()
    )[0]

    return {
      amount: amount * latestRate.rate,
      rate: latestRate.rate,
      currency: baseCurrency,
    }
  }

  return { getConversionPreview, exchangeRates, isLoading }
}
