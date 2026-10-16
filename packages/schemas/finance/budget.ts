import { z } from "zod"
import { nonEmptyString, positiveAmountString } from "../common"

export const BudgetSchema = z.compile(
  z.object({
    name: nonEmptyString("Budget name is required"),
    limit: positiveAmountString(
      "Limit amount is required",
      "Limit amount must be a positive number"
    ),
    currency: z.string().min(1, { error: "Currency is required" }),
    interval: z.enum([
      "RECURRENCE_INTERVAL_UNSPECIFIED",
      "WEEKLY",
      "MONTHLY",
      "YEARLY",
      "ONE_TIME",
    ]),
    icon: z.string().min(1, { error: "Icon is required" }),
    color: z.string().min(1, { error: "Color is required" }),
    status: z
      .enum(["STATUS_UNSPECIFIED", "ACTIVE", "PAUSED", "CLOSED"])
      .optional(),
    defaultAccountId: z.string().optional(),
  })
)

export type BudgetFormValues = z.infer<typeof BudgetSchema>
