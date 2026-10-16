import { z } from "zod"
import { positiveAmountString } from "../common"

export const ExchangeRateSchema = z.compile(
  z.object({
    fromCurrency: z.string().min(1, { error: "Source currency is required" }),
    toCurrency: z.string().min(1, { error: "Target currency is required" }),
    rateValue: positiveAmountString(
      "Exchange rate is required",
      "Rate must be a positive number"
    ),
    rateDirection: z.enum(["direct", "inverse"]),
    rateDate: z.date(),
  })
)

export type ExchangeRateFormValues = z.infer<typeof ExchangeRateSchema>
