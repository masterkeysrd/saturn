import { z } from "zod"

export const confirmTransactionSchema = z
  .object({
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
    accountId: z.string().optional(),
    budgetId: z.string().optional(),
    description: z.string().trim().min(1, "Description is required"),
    transactionDate: z.date(),
    effectiveDate: z.date(),
    type: z.enum(["EXPENSE", "INCOME"]).optional(),
  })
  .refine(
    (data) => {
      if (data.type === "EXPENSE" && !data.budgetId) {
        return false
      }
      return true
    },
    {
      message: "Budget is required for expenses",
      path: ["budgetId"],
    }
  )

export type ConfirmTransactionFormValues = z.infer<
  typeof confirmTransactionSchema
>
