import { z } from "zod"
import { nonEmptyString, numericAmountString } from "../common"

export const AccountSchema = z.compile(
  z
    .object({
      name: nonEmptyString("Account name is required"),
      lastFour: z
        .string()
        .max(4, { error: "Max 4 digits" })
        .regex(/^\d*$/, { error: "Must be numbers only" })
        .optional(),
      type: z.enum([
        "TYPE_UNSPECIFIED",
        "BANK",
        "CREDIT_CARD",
        "CASH",
        "DIGITAL_ACCOUNT",
      ]),
      currency: z.string().min(1, { error: "Currency is required" }),
      initialBalance: numericAmountString(
        "Initial balance is required",
        "Initial balance must be a valid number"
      ),
      creditLimit: z.string().optional(),
      color: z.string().min(1, { error: "Color is required" }),
      institutionId: z.string().optional(),
      isDefault: z.boolean(),
      isActive: z.boolean(),
      notes: z.string().optional(),
    })
    .refine(
      (data) => {
        if (data.type === "CREDIT_CARD" && data.creditLimit) {
          const num = parseFloat(data.creditLimit)
          return !Number.isNaN(num) && num >= 0
        }
        return true
      },
      {
        error: "Credit limit must be a valid non-negative number",
        path: ["creditLimit"],
      }
    )
)

export type AccountFormValues = z.infer<typeof AccountSchema>
