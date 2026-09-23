import { z } from "zod"

export const transferSchema = z
  .object({
    sourceAccountId: z.string().min(1, "Source account is required"),
    destinationAccountId: z.string().min(1, "Destination account is required"),
    sourceAmount: z
      .string()
      .min(1, "Source amount is required")
      .refine(
        (val) => {
          const num = parseFloat(val)
          return !isNaN(num) && num > 0
        },
        { message: "Source amount must be greater than zero" }
      ),
    destinationAmount: z
      .string()
      .min(1, "Destination amount is required")
      .refine(
        (val) => {
          const num = parseFloat(val)
          return !isNaN(num) && num > 0
        },
        { message: "Destination amount must be greater than zero" }
      ),
    transferDate: z.date(),
    notes: z.string().optional(),
  })
  .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
    message: "Source and destination accounts must be different",
    path: ["destinationAccountId"],
  })

export type TransferFormValues = z.infer<typeof transferSchema>
