import { z } from "zod"

export const budgetSchema = z.object({
  name: z.string().trim().min(1, "Budget name is required"),
  limit: z
    .string()
    .min(1, "Limit amount is required")
    .refine(
      (val) => {
        const num = parseFloat(val)
        return !isNaN(num) && num > 0
      },
      { message: "Limit amount must be a positive number" }
    ),
  currency: z.string().min(1, "Currency is required"),
  interval: z.enum([
    "RECURRENCE_INTERVAL_UNSPECIFIED",
    "WEEKLY",
    "MONTHLY",
    "YEARLY",
  ]),
  icon: z.string().min(1, "Icon is required"),
  color: z.string().min(1, "Color is required"),
  defaultAccountId: z.string().optional(),
})

export type BudgetFormValues = z.infer<typeof budgetSchema>
