import {
  useListExchangeRatesQuery,
  type ExchangeRate,
} from "@saturn/api/saturn/finance/v1/finance"
import {
  convertCurrency,
  type ConversionPreviewResult,
  type ConversionPreviewSuccess,
  type ConversionPreviewError,
} from "@saturn/core"

export type {
  ConversionPreviewResult,
  ConversionPreviewSuccess,
  ConversionPreviewError,
}

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

  const exchangeRates: ExchangeRate[] = ratesData?.exchangeRates || []

  const getConversionPreview = (
    amountStr?: string,
    fromCurrency?: string
  ): ConversionPreviewResult | null => {
    if (!amountStr || !fromCurrency || !baseCurrency) return null
    const amount = parseFloat(amountStr)
    if (isNaN(amount)) return null
    if (fromCurrency === baseCurrency) return null

    return convertCurrency(amount, fromCurrency, baseCurrency, exchangeRates)
  }

  return { getConversionPreview, exchangeRates, isLoading }
}
