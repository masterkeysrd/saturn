import { z } from "zod"
import { numericAmountString } from "../common"

export const adjustBalanceShape = {
  targetBalance: numericAmountString(
    "finance.targetBalanceRequired",
    "finance.targetBalanceInvalid"
  ),
  notes: z.string().optional(),
}

export const AdjustBalanceSchema = z.compile(z.object(adjustBalanceShape))

export type AdjustBalanceFormValues = z.infer<typeof AdjustBalanceSchema>
