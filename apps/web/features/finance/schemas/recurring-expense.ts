import { z } from "zod"

export const recurringExpenseSchema = z.object({
  budgetId: z.string().min(1, "Budget is required"),
  name: z.string().trim().min(1, "Template name is required"),
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
  interval: z.enum(["WEEKLY", "MONTHLY", "YEARLY", "INTERVAL_UNSPECIFIED"]),
  nextDueDate: z.date(),
  gracePeriodDays: z.number().min(0, "Grace period cannot be negative"),
  isVariable: z.boolean(),
  status: z.enum(["ACTIVE", "PAUSED", "ENDED", "STATUS_UNSPECIFIED"]),
})

export type RecurringExpenseFormValues = z.infer<typeof recurringExpenseSchema>
