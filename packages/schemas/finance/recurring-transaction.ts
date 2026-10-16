import { z } from "zod"
import { nonEmptyString, positiveAmountString } from "../common"

export const RecurringTransactionSchema = z.compile(
  z
    .object({
      budgetId: z.string().optional(),
      accountId: z.string().optional(),
      name: nonEmptyString("Template name is required"),
      amount: positiveAmountString(),
      currency: z.string().min(1, { error: "Currency is required" }),
      interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY", "INTERVAL_UNSPECIFIED"]),
      nextDueDate: z.date(),
      gracePeriodDays: z
        .number()
        .min(0, { error: "Grace period cannot be negative" }),
      isVariable: z.boolean(),
      status: z.enum(["ACTIVE", "PAUSED", "ENDED", "STATUS_UNSPECIFIED"]),
      type: z.enum(["EXPENSE", "INCOME"]),
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

export type RecurringTransactionFormValues = z.infer<
  typeof RecurringTransactionSchema
>
