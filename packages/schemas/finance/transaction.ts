import { z } from "zod"
import { nonEmptyString, positiveAmountString } from "../common"
import { schemaError } from "../i18n"

const baseTransactionShape = {
  accountId: z.string().optional(),
  description: nonEmptyString("finance.descriptionRequired"),
  amount: positiveAmountString(),
  currency: z
    .string()
    .min(1, { error: schemaError("finance.currencyRequired") }),
  transactionDate: z.date(),
  hasCustomEffectiveDate: z.boolean(),
  effectiveDate: z.date(),
}

export const TransactionSchema = z.compile(
  z.object({
    ...baseTransactionShape,
    budgetId: z
      .string()
      .min(1, { error: schemaError("finance.budgetRequired") }),
  })
)

export type TransactionFormValues = z.infer<typeof TransactionSchema>

export const IncomeSchema = z.compile(z.object(baseTransactionShape))

export type IncomeFormValues = z.infer<typeof IncomeSchema>
