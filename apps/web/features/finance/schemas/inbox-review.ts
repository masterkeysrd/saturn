import { z } from "zod"

export const inboxReviewSchema = z.object({
  selectedTxId: z.string().optional(),
  overwriteLinkedTx: z.boolean(),
  docType: z.enum([
    "RECEIPT",
    "INVOICE",
    "BANK_NOTIFICATION",
    "UNKNOWN",
    "SYSTEM_VERIFICATION",
  ]),
  transactionType: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  description: z.string().trim().min(1, "Vendor / Description is required"),
  amountStr: z
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
  accountId: z.string().optional(),
  destinationAccountId: z.string().optional(),
  transferLeg: z.enum(["SOURCE", "DESTINATION"]),
  budgetId: z.string().optional(),
  scheduledPaymentId: z.string().optional(),
  borrowingId: z.string().optional(),
})

export type InboxReviewFormValues = z.infer<typeof inboxReviewSchema>
