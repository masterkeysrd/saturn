import { z } from "zod"

export const exchangeRateSchema = z.object({
  fromCurrency: z.string().min(1, "Source currency is required"),
  toCurrency: z.string().min(1, "Target currency is required"),
  rateValue: z
    .string()
    .min(1, "Exchange rate is required")
    .refine(
      (val) => {
        const num = parseFloat(val)
        return !isNaN(num) && num > 0
      },
      { message: "Rate must be a positive number" }
    ),
  rateDirection: z.enum(["direct", "inverse"]),
  rateDate: z.date(),
})

export type ExchangeRateFormValues = z.infer<typeof exchangeRateSchema>
