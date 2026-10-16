import { z } from "zod"
import { positiveAmountString } from "../common"

export const TransferSchema = z.compile(
  z
    .object({
      sourceAccountId: z
        .string()
        .min(1, { error: "Source account is required" }),
      destinationAccountId: z
        .string()
        .min(1, { error: "Destination account is required" }),
      sourceAmount: positiveAmountString(
        "Source amount is required",
        "Source amount must be greater than zero"
      ),
      destinationAmount: positiveAmountString(
        "Destination amount is required",
        "Destination amount must be greater than zero"
      ),
      transferDate: z.date(),
      notes: z.string().optional(),
    })
    .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
      error: "Source and destination accounts must be different",
      path: ["destinationAccountId"],
    })
)

export type TransferFormValues = z.infer<typeof TransferSchema>
