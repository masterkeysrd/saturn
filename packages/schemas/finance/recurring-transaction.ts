import { z } from "zod"
import { nonEmptyString, positiveAmountString } from "../common"
import { schemaError } from "../i18n"

export const RecurringTransactionSchema = z.compile(
  z
    .object({
      budgetId: z.string().optional(),
      accountId: z.string().optional(),
      name: nonEmptyString("finance.templateNameRequired"),
      amount: positiveAmountString(),
      currency: z
        .string()
        .min(1, { error: schemaError("finance.currencyRequired") }),
      interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY", "INTERVAL_UNSPECIFIED"]),
      nextDueDate: z.date(),
      gracePeriodDays: z
        .number()
        .min(0, { error: schemaError("finance.gracePeriodNonNegative") }),
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
        error: schemaError("finance.budgetRequiredForExpense"),
        path: ["budgetId"],
      }
    )
)

export type RecurringTransactionFormValues = z.infer<
  typeof RecurringTransactionSchema
>
