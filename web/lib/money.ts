export type CurrencyCode = "USD" | "EUR" | "DOP";

const CurrencySymbols = {
  DOP: "RD$",
  USD: "USD$",
  EUR: "€",
  // add any others you prefer
};

/*
 * Uses cents to avoid floating-point precision issues.
 */
export interface Money {
  /** Amount in smallest currency unit (cents) */
  cents: number;
  /** ISO 4217 currency code */
  currency: CurrencyCode;
}

/**
 * Format a Money value as a locale-aware currency string.
 */
export function formatMoney(money: Money, locale = "en-US"): string {
  const text = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    currencyDisplay: "symbol",
    currencySign: "standard",
  }).format(money.cents / 100);

  const customSymbol = CurrencySymbols[money.currency];

  // Replace only if needed
  if (customSymbol) {
    // Replace either a code or a default symbol
    return text.replace(money.currency, customSymbol);
  }

  return text;
}

export function formatCurrency(code: CurrencyCode): string {
  const customSymbol = CurrencySymbols[code];

  if (customSymbol) {
    return customSymbol;
  }

  return `${code} $`;
}

/**
 * Create zero money value.
 */
export function zero(currency: CurrencyCode = "USD"): Money {
  return {
    currency,
    cents: 0,
  };
}

/**
 * Convert decimal amount to cents.
 *
 * @example
 * ```ts
 * toCents(50.99) // 5099
 * toCents(1.00)  // 100
 * toCents(0.00)  // 0
 * ```
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert cents to decimal amount.
 *
 * @example
 * ```ts
 * toDecimal(5099) // 50.99
 * toDecimal(100)  // 1.00
 * toDecimal(0)    // 0.00
 * ```
 */
export function toDecimal(cents: number): number {
  return cents / 100;
}

/**
 * Convert Money to decimal amount.
 *
 * @example
 * ```ts
 * const price = { cents: 5099, currency: 'USD' };
 * toDecimalFromMoney(price) // 50.99
 * ```
 */
export function toDecimalFromMoney(money: Money): number {
  return money.cents / 100;
}

export const money = {
  /** Format a Money value as a locale-aware currency string */
  format: formatMoney,
  /** Format the currency */
  formatCurrency,
  /** Convert cents to decimal amount */
  toDecimal,
  /** Convert Money to decimal amount */
  toDecimalFromMoney,
  /** Convert Money to decimal amount */
  toCents,
  /** Creates a zero money */
  zero,
} as const;
