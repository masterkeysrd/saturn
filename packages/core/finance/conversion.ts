import { formatCents } from "./formatting"

export interface ExchangeRateLike {
  fromCurrency: string
  toCurrency: string
  rate: number
  rateDate: string
}

export interface AccountLike {
  id?: string
  name?: string
  type: string
  currency: string
  currentBalance?: string
  isActive?: boolean
  conversion?: {
    balance?: string
    rate?: number
  }
}

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

/**
 * Pure calculation to convert an amount between currencies using a list of exchange rates.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  exchangeRates: ExchangeRateLike[]
): ConversionPreviewResult {
  if (fromCurrency === baseCurrency) {
    return {
      amount,
      rate: 1,
      currency: baseCurrency,
    }
  }

  if (amount === 0) {
    return {
      amount: 0,
      rate: 1,
      currency: baseCurrency,
    }
  }

  const matchingRates = exchangeRates.filter(
    (r) => r.fromCurrency === fromCurrency && r.toCurrency === baseCurrency
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

/**
 * Converts an account's balance (in cents) to the base currency (in cents).
 * Uses backend hydrated conversion if present, or calculates via latest exchange rate.
 */
export function getAccountBaseCents(
  acc: AccountLike,
  baseCurrency: string,
  exchangeRates: ExchangeRateLike[]
): number {
  const rawCents = Number(acc.currentBalance || 0)
  if (!acc.currency || acc.currency === baseCurrency) {
    return rawCents
  }
  if (acc.conversion?.balance) {
    return Number(acc.conversion.balance)
  }

  const preview = convertCurrency(
    formatCents(rawCents),
    acc.currency,
    baseCurrency,
    exchangeRates
  )

  if ("amount" in preview && typeof preview.amount === "number") {
    return Math.round(preview.amount * 100)
  }

  return rawCents
}

export interface AccountMetrics {
  netWorthCents: number
  totalAssetsCents: number
  totalLiabilitiesCents: number
  activeCount: number
}

/**
 * Calculates aggregate Net Worth, Total Assets, and Total Liabilities across active accounts in base currency cents.
 * Handles credit card sign convention (positive balance = debt owed, negative balance = overpayment credit).
 */
export function calculateAccountMetrics(
  accounts: AccountLike[],
  baseCurrency: string,
  exchangeRates: ExchangeRateLike[]
): AccountMetrics {
  let totalAssetsCents = 0
  let totalLiabilitiesCents = 0
  let activeCount = 0

  accounts.forEach((acc) => {
    if (acc.isActive) {
      activeCount++
      const baseCents = getAccountBaseCents(acc, baseCurrency, exchangeRates)

      if (acc.type === "CREDIT_CARD") {
        if (baseCents > 0) {
          totalLiabilitiesCents += baseCents // Positive = Debt Owed
        } else {
          totalAssetsCents += Math.abs(baseCents) // Negative = Statement Credit / Overpayment
        }
      } else {
        if (baseCents < 0) {
          totalLiabilitiesCents += Math.abs(baseCents) // Bank Overdraft
        } else {
          totalAssetsCents += baseCents // Cash / Checking Asset
        }
      }
    }
  })

  return {
    netWorthCents: totalAssetsCents - totalLiabilitiesCents,
    totalAssetsCents,
    totalLiabilitiesCents,
    activeCount,
  }
}
