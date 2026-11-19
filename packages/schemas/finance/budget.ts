import { z } from "zod"
import { nonEmptyString, positiveAmountString } from "../common"
import { schemaError } from "../i18n"

export const BudgetSchema = z.compile(
  z.object({
    name: nonEmptyString("finance.budgetNameRequired"),
    limit: positiveAmountString(
      "finance.limitAmountRequired",
      "finance.limitAmountPositive"
    ),
    currency: z
      .string()
      .min(1, { error: schemaError("finance.currencyRequired") }),
    interval: z.enum([
      "RECURRENCE_INTERVAL_UNSPECIFIED",
      "WEEKLY",
      "MONTHLY",
      "YEARLY",
      "ONE_TIME",
    ]),
    icon: z.string().min(1, { error: schemaError("finance.iconRequired") }),
    color: z.string().min(1, { error: schemaError("finance.colorRequired") }),
    status: z
      .enum(["STATUS_UNSPECIFIED", "ACTIVE", "PAUSED", "CLOSED"])
      .optional(),
    defaultAccountId: z.string().optional(),
  })
)

export type BudgetFormValues = z.infer<typeof BudgetSchema>
