import { z } from "zod"

export const adjustBalanceSchema = z.object({
  targetBalance: z.string().min(1, "Target balance is required"),
  notes: z.string().optional(),
})

export type AdjustBalanceFormValues = z.infer<typeof adjustBalanceSchema>
