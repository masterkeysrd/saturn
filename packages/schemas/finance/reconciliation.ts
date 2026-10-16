import { z } from "zod"
import { nonEmptyString, positiveAmountString } from "../common"

export const ConfirmTransactionSchema = z.compile(
  z
    .object({
      amount: positiveAmountString(),
      accountId: z.string().optional(),
      budgetId: z.string().optional(),
      description: nonEmptyString("Description is required"),
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
        error: "Budget is required for expenses",
        path: ["budgetId"],
      }
    )
)

export type ConfirmTransactionFormValues = z.infer<
  typeof ConfirmTransactionSchema
>
