import { z } from "zod"
import { positiveAmountString } from "../common"
import { schemaError } from "../i18n"

export const TransferSchema = z.compile(
  z
    .object({
      sourceAccountId: z
        .string()
        .min(1, { error: schemaError("finance.sourceAccountRequired") }),
      destinationAccountId: z
        .string()
        .min(1, { error: schemaError("finance.destinationAccountRequired") }),
      sourceAmount: positiveAmountString(
        "finance.sourceAmountRequired",
        "finance.sourceAmountPositive"
      ),
      destinationAmount: positiveAmountString(
        "finance.destinationAmountRequired",
        "finance.destinationAmountPositive"
      ),
      transferDate: z.date(),
      notes: z.string().optional(),
    })
    .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
      error: schemaError("finance.differentAccounts"),
      path: ["destinationAccountId"],
    })
)

export type TransferFormValues = z.infer<typeof TransferSchema>
