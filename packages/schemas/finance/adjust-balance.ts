import { z } from "zod"
import { numericAmountString } from "../common"

export const adjustBalanceShape = {
  targetBalance: numericAmountString(
    "Target balance is required",
    "Target balance must be a valid number"
  ),
  notes: z.string().optional(),
}

export const AdjustBalanceSchema = z.compile(z.object(adjustBalanceShape))

export type AdjustBalanceFormValues = z.infer<typeof AdjustBalanceSchema>
