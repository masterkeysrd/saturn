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
  accountId: z.string().optional(),
})

export type BorrowingFormValues = z.infer<typeof borrowingSchema>

export const repaymentSchema = z.object({
  borrowingId: z.string().optional(),
  type: z
    .enum([
      "BORROWING_TRANSACTION_TYPE_PAYMENT",
      "BORROWING_TRANSACTION_TYPE_DISBURSEMENT",
    ])
    .optional(),
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

export const adjustBorrowingSchema = z.object({
  targetBalance: z.string().min(1, "Target balance is required"),
  adjustmentDate: z.date(),
  accountId: z.string().optional(),
  notes: z.string().optional(),
})

export type AdjustBorrowingFormValues = z.infer<typeof adjustBorrowingSchema>

export const borrowingTransactionSchema = z.object({
  type: z.enum([
    "BORROWING_TRANSACTION_TYPE_PAYMENT",
    "BORROWING_TRANSACTION_TYPE_DISBURSEMENT",
  ]),
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
  accountId: z.string().min(1, "Account is required"),
  notes: z.string().optional(),
  transactionDate: z.date(),
})

export type BorrowingTransactionFormValues = z.infer<
  typeof borrowingTransactionSchema
>
