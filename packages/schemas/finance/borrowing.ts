import { z } from "zod"
import { nonEmptyString, positiveAmountString } from "../common"
import { adjustBalanceShape } from "./adjust-balance"

export const BorrowingSchema = z.compile(
  z.object({
    direction: z.enum(["LENT", "BORROWED", "DIRECTION_UNSPECIFIED"]),
    counterparty: nonEmptyString("Counterparty name is required"),
    contactInfo: z.string().optional(),
    amount: positiveAmountString(),
    currency: z.string().min(1, { error: "Currency is required" }),
    establishedAt: z.date(),
    hasDueDate: z.boolean(),
    dueAt: z.date().optional(),
    notes: z.string().optional(),
    createAsTransaction: z.boolean(),
    accountId: z.string().optional(),
  })
)

export type BorrowingFormValues = z.infer<typeof BorrowingSchema>

const baseBorrowingTxShape = {
  type: z.enum([
    "BORROWING_TRANSACTION_TYPE_PAYMENT",
    "BORROWING_TRANSACTION_TYPE_DISBURSEMENT",
  ]),
  amount: positiveAmountString(),
  notes: z.string().optional(),
}

export const RepaymentSchema = z.compile(
  z.object({
    ...baseBorrowingTxShape,
    borrowingId: z.string().optional(),
    type: baseBorrowingTxShape.type.optional(),
    amount: positiveAmountString("Repayment amount is required"),
    paymentDate: z.date(),
    accountId: z.string().optional(),
  })
)

export type RepaymentFormValues = z.infer<typeof RepaymentSchema>

export const AdjustBorrowingSchema = z.compile(
  z.object({
    ...adjustBalanceShape,
    adjustmentDate: z.date(),
    accountId: z.string().optional(),
  })
)

export type AdjustBorrowingFormValues = z.infer<typeof AdjustBorrowingSchema>

export const BorrowingTransactionSchema = z.compile(
  z.object({
    ...baseBorrowingTxShape,
    accountId: z.string().min(1, { error: "Account is required" }),
    transactionDate: z.date(),
  })
)

export type BorrowingTransactionFormValues = z.infer<
  typeof BorrowingTransactionSchema
>
