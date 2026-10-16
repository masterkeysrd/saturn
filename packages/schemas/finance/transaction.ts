import { z } from "zod"
import { nonEmptyString, positiveAmountString } from "../common"

const baseTransactionShape = {
  accountId: z.string().optional(),
  description: nonEmptyString("Description is required"),
  amount: positiveAmountString(),
  currency: z.string().min(1, { error: "Currency is required" }),
  transactionDate: z.date(),
  hasCustomEffectiveDate: z.boolean(),
  effectiveDate: z.date(),
}

export const TransactionSchema = z.compile(
  z.object({
    ...baseTransactionShape,
    budgetId: z.string().min(1, { error: "Budget is required" }),
  })
)

export type TransactionFormValues = z.infer<typeof TransactionSchema>

export const IncomeSchema = z.compile(z.object(baseTransactionShape))

export type IncomeFormValues = z.infer<typeof IncomeSchema>
