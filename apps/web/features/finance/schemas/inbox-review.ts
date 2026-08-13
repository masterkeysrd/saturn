import { z } from "zod"

export const inboxReviewSchema = z
  .object({
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
    description: z.string().optional(),
    amountStr: z.string().optional(),
    currency: z.string().optional(),
    accountId: z.string().optional(),
    destinationAccountId: z.string().optional(),
    transferLeg: z.enum(["SOURCE", "DESTINATION"]),
    budgetId: z.string().optional(),
    scheduledPaymentId: z.string().optional(),
    borrowingId: z.string().optional(),
    borrowingLinkType: z
      .enum(["INITIAL_RECEIPT", "REPAYMENT", "ADDITIONAL_LOAN"])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.docType === "SYSTEM_VERIFICATION") {
      return
    }

    if (!data.description || data.description.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vendor / Description is required",
        path: ["description"],
      })
    }

    if (!data.amountStr || data.amountStr.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount is required",
        path: ["amountStr"],
      })
    } else {
      const num = parseFloat(data.amountStr)
      if (isNaN(num) || num <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Amount must be greater than zero",
          path: ["amountStr"],
        })
      }
    }
  })

export type InboxReviewFormValues = z.infer<typeof inboxReviewSchema>
