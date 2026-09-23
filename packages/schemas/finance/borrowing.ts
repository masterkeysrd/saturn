import { z } from "zod"

export const borrowingSchema = z.object({
  direction: z.enum(["LENT", "BORROWED", "DIRECTION_UNSPECIFIED"]),
  counterparty: z.string().trim().min(1, "Counterparty name is required"),
  contactInfo: z.string().optional(),
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
  establishedAt: z.date(),
  hasDueDate: z.boolean(),
  dueAt: z.date().optional(),
  notes: z.string().optional(),
  createAsTransaction: z.boolean(),
})

export type BorrowingFormValues = z.infer<typeof borrowingSchema>

export const repaymentSchema = z.object({
  amount: z
    .string()
    .min(1, "Repayment amount is required")
    .refine(
      (val) => {
        const num = parseFloat(val)
        return !isNaN(num) && num > 0
      },
      { message: "Amount must be greater than zero" }
    ),
  paymentDate: z.date(),
  accountId: z.string().optional(),
  notes: z.string().optional(),
})

export type RepaymentFormValues = z.infer<typeof repaymentSchema>
