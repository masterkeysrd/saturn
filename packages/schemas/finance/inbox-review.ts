import { z } from "zod"
import { schemaMessage } from "../i18n"

export const InboxReviewSchema = z.compile(
  z
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
      scheduledTransactionId: z.string().optional(),
      borrowingId: z.string().optional(),
      borrowingLinkType: z
        .enum(["INITIAL_RECEIPT", "REPAYMENT", "ADDITIONAL_LOAN"])
        .optional(),
    })
    .check((ctx) => {
      const data = ctx.value
      if (data.docType === "SYSTEM_VERIFICATION") {
        return
      }

      if (!data.description || data.description.trim().length === 0) {
        ctx.issues.push({
          code: "custom",
          message: schemaMessage("finance.vendorOrDescriptionRequired"),
          path: ["description"],
          input: ctx.value,
        })
      }

      if (!data.amountStr || data.amountStr.trim().length === 0) {
        ctx.issues.push({
          code: "custom",
          message: schemaMessage("common.amountRequired"),
          path: ["amountStr"],
          input: ctx.value,
        })
      } else {
        const num = parseFloat(data.amountStr)
        if (Number.isNaN(num) || num <= 0) {
          ctx.issues.push({
            code: "custom",
            message: schemaMessage("common.amountPositive"),
            path: ["amountStr"],
            input: ctx.value,
          })
        }
      }
    })
)

export type InboxReviewFormValues = z.infer<typeof InboxReviewSchema>
