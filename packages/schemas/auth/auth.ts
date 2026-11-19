import { z } from "zod"
import { nonEmptyString } from "../common"
import { schemaError } from "../i18n"

export const LoginSchema = z.compile(
  z.object({
    identifier: nonEmptyString("auth.usernameOrEmailRequired"),
    password: z
      .string()
      .min(1, { error: schemaError("auth.passwordRequired") }),
    rememberMe: z.boolean().optional(),
  })
)

export type LoginFormValues = z.infer<typeof LoginSchema>

export const RegisterSchema = z.compile(
  z.object({
    name: nonEmptyString("auth.nameRequired"),
    username: z.string().trim().optional(),
    email: nonEmptyString("auth.emailRequired").pipe(
      z.email({ error: schemaError("auth.emailInvalid") })
    ),
    password: z
      .string()
      .min(6, { error: schemaError("auth.passwordMinLength") }),
  })
)

export type RegisterFormValues = z.infer<typeof RegisterSchema>

export const ChangePasswordSchema = z.compile(
  z
    .object({
      currentPassword: z
        .string()
        .min(1, { error: schemaError("auth.currentPasswordRequired") }),
      newPassword: z.string().min(8, {
        error: schemaError("auth.newPasswordMinLength"),
      }),
      confirmPassword: z
        .string()
        .min(1, { error: schemaError("auth.confirmPasswordRequired") }),
      totpCode: z.string().optional(),
      revokeOtherSessions: z.boolean(),
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      error: schemaError("auth.newPasswordSameAsCurrent"),
      path: ["newPassword"],
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      error: schemaError("auth.passwordsMismatch"),
      path: ["confirmPassword"],
    })
)

export type ChangePasswordFormValues = z.infer<typeof ChangePasswordSchema>

export const ServerSettingsSchema = z.compile(
  z.object({
    serverUrl: nonEmptyString("auth.serverUrlRequired"),
  })
)

export type ServerSettingsFormValues = z.infer<typeof ServerSettingsSchema>

export const MfaStepUpSchema = z.compile(
  z.object({
    code: z
      .string()
      .trim()
      .length(6, { error: schemaError("auth.mfaCodeLength") })
      .regex(/^\d+$/, { error: schemaError("auth.mfaCodeDigitsOnly") }),
  })
)

export type MfaStepUpFormValues = z.infer<typeof MfaStepUpSchema>

export const RecoveryCodeSchema = z.compile(
  z.object({
    code: nonEmptyString("auth.recoveryCodeRequired"),
  })
)

export type RecoveryCodeFormValues = z.infer<typeof RecoveryCodeSchema>
