import { z } from "zod"

export const confirmPaymentSchema = z.object({
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
  budgetId: z.string().min(1, "Budget is required"),
  description: z.string().trim().min(1, "Description is required"),
  transactionDate: z.date(),
  effectiveDate: z.date(),
})

export type ConfirmPaymentFormValues = z.infer<typeof confirmPaymentSchema>
