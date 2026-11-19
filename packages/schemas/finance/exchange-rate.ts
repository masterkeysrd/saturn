import { z } from "zod"
import { positiveAmountString } from "../common"
import { schemaError } from "../i18n"

export const ExchangeRateSchema = z.compile(
  z.object({
    fromCurrency: z
      .string()
      .min(1, { error: schemaError("finance.sourceCurrencyRequired") }),
    toCurrency: z
      .string()
      .min(1, { error: schemaError("finance.targetCurrencyRequired") }),
    rateValue: positiveAmountString(
      "finance.exchangeRateRequired",
      "finance.ratePositive"
    ),
    rateDirection: z.enum(["direct", "inverse"]),
    rateDate: z.date(),
  })
)

export type ExchangeRateFormValues = z.infer<typeof ExchangeRateSchema>
