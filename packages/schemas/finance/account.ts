import { z } from "zod"

export const accountSchema = z
  .object({
    name: z.string().trim().min(1, "Account name is required"),
    lastFour: z
      .string()
      .max(4, "Max 4 digits")
      .regex(/^\d*$/, "Must be numbers only")
      .optional(),
    type: z.enum([
      "TYPE_UNSPECIFIED",
      "BANK",
      "CREDIT_CARD",
      "CASH",
      "DIGITAL_ACCOUNT",
    ]),
    currency: z.string().min(1, "Currency is required"),
    initialBalance: z.string().refine(
      (val) => {
        const num = parseFloat(val)
        return !isNaN(num)
      },
      { message: "Initial balance must be a valid number" }
    ),
    creditLimit: z.string().optional(),
    color: z.string().min(1, "Color is required"),
    institutionId: z.string().optional(),
    isDefault: z.boolean(),
    isActive: z.boolean(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.type === "CREDIT_CARD" && data.creditLimit) {
        const num = parseFloat(data.creditLimit)
        return !isNaN(num) && num >= 0
      }
      return true
    },
    {
      message: "Credit limit must be a valid non-negative number",
      path: ["creditLimit"],
    }
  )

export type AccountFormValues = z.infer<typeof accountSchema>
