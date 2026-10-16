import { z } from "zod"

export const nonEmptyString = (error: string) =>
  z.string().trim().min(1, { error })

export const positiveAmountString = (
  requiredError = "Amount is required",
  positiveError = "Amount must be greater than zero"
) =>
  z
    .string()
    .min(1, { error: requiredError })
    .refine(
      (val) => {
        const num = parseFloat(val)
        return !Number.isNaN(num) && num > 0
      },
      { error: positiveError }
    )

export const numericAmountString = (
  requiredError = "Amount is required",
  invalidError = "Amount must be a valid number"
) =>
  z
    .string()
    .min(1, { error: requiredError })
    .refine((val) => !Number.isNaN(parseFloat(val)), { error: invalidError })
