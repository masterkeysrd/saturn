import { z } from "zod"

export const transactionSchema = z.object({
  budgetId: z.string().min(1, "Budget is required"),
  accountId: z.string().optional(),
  description: z.string().trim().min(1, "Description is required"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine(
      (val) => {
        const num = parseFloat(val)
        return !isNaN(num) && num > 0
      },
      { message: "Amount must be greater than zero" }
    ),
  currency: z.string().min(1, "Currency is required"),
  transactionDate: z.date(),
  hasCustomEffectiveDate: z.boolean(),
  effectiveDate: z.date(),
})

export type TransactionFormValues = z.infer<typeof transactionSchema>

export const incomeSchema = z.object({
  accountId: z.string().optional(),
  description: z.string().trim().min(1, "Description is required"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine(
      (val) => {
        const num = parseFloat(val)
        return !isNaN(num) && num > 0
      },
      { message: "Amount must be greater than zero" }
    ),
  currency: z.string().min(1, "Currency is required"),
  transactionDate: z.date(),
  hasCustomEffectiveDate: z.boolean(),
  effectiveDate: z.date(),
})

export type IncomeFormValues = z.infer<typeof incomeSchema>
