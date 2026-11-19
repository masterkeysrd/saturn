import { z } from "zod"
import { nonEmptyString, numericAmountString } from "../common"
import { schemaError } from "../i18n"

export const AccountSchema = z.compile(
  z
    .object({
      name: nonEmptyString("finance.accountNameRequired"),
      lastFour: z
        .string()
        .max(4, { error: schemaError("finance.lastFourMaxLength") })
        .regex(/^\d*$/, { error: schemaError("finance.lastFourDigitsOnly") })
        .optional(),
      type: z.enum([
        "TYPE_UNSPECIFIED",
        "BANK",
        "CREDIT_CARD",
        "CASH",
        "DIGITAL_ACCOUNT",
      ]),
      currency: z
        .string()
        .min(1, { error: schemaError("finance.currencyRequired") }),
      initialBalance: numericAmountString(
        "finance.initialBalanceRequired",
        "finance.initialBalanceInvalid"
      ),
      creditLimit: z.string().optional(),
      color: z.string().min(1, { error: schemaError("finance.colorRequired") }),
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
        error: schemaError("finance.creditLimitInvalid"),
        path: ["creditLimit"],
      }
    )
)

export type AccountFormValues = z.infer<typeof AccountSchema>
