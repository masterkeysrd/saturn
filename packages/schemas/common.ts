import { z } from "zod"
import type { SchemaTranslationKey } from "@saturn/i18n"
import { schemaError } from "./i18n"

export const nonEmptyString = (key: SchemaTranslationKey) =>
  z
    .string()
    .trim()
    .min(1, { error: schemaError(key) })

export const positiveAmountString = (
  requiredKey: SchemaTranslationKey = "common.amountRequired",
  positiveKey: SchemaTranslationKey = "common.amountPositive"
) =>
  z
    .string()
    .min(1, { error: schemaError(requiredKey) })
    .refine(
      (val) => {
        const num = parseFloat(val)
        return !Number.isNaN(num) && num > 0
      },
      { error: schemaError(positiveKey) }
    )

export const numericAmountString = (
  requiredKey: SchemaTranslationKey = "common.amountRequired",
  invalidKey: SchemaTranslationKey = "common.amountInvalid"
) =>
  z
    .string()
    .min(1, { error: schemaError(requiredKey) })
    .refine((val) => !Number.isNaN(parseFloat(val)), {
      error: schemaError(invalidKey),
    })
