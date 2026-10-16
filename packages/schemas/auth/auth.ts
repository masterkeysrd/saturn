import { z } from "zod"
import { nonEmptyString } from "../common"

export const LoginSchema = z.compile(
  z.object({
    identifier: nonEmptyString("Username or email is required"),
    password: z.string().min(1, { error: "Password is required" }),
    rememberMe: z.boolean().optional(),
  })
)

export type LoginFormValues = z.infer<typeof LoginSchema>

export const RegisterSchema = z.compile(
  z.object({
    name: nonEmptyString("Name is required"),
    username: z.string().trim().optional(),
    email: nonEmptyString("Email is required").pipe(
      z.email({ error: "Please enter a valid email address" })
    ),
    password: z
      .string()
      .min(6, { error: "Password must be at least 6 characters" }),
  })
)

export type RegisterFormValues = z.infer<typeof RegisterSchema>

export const ChangePasswordSchema = z.compile(
  z
    .object({
      currentPassword: z
        .string()
        .min(1, { error: "Current password is required" }),
      newPassword: z
        .string()
        .min(8, { error: "New password must be at least 8 characters" }),
      confirmPassword: z
        .string()
        .min(1, { error: "Please confirm your new password" }),
      totpCode: z.string().optional(),
      revokeOtherSessions: z.boolean(),
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      error: "New password cannot be the same as your current password",
      path: ["newPassword"],
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      error: "Passwords do not match",
      path: ["confirmPassword"],
    })
)

export type ChangePasswordFormValues = z.infer<typeof ChangePasswordSchema>

export const ServerSettingsSchema = z.compile(
  z.object({
    serverUrl: nonEmptyString("Server URL is required"),
  })
)

export type ServerSettingsFormValues = z.infer<typeof ServerSettingsSchema>

export const MfaStepUpSchema = z.compile(
  z.object({
    code: z
      .string()
      .trim()
      .length(6, { error: "Please enter all 6 digits" })
      .regex(/^\d+$/, { error: "Code must contain only numbers" }),
  })
)

export type MfaStepUpFormValues = z.infer<typeof MfaStepUpSchema>

export const RecoveryCodeSchema = z.compile(
  z.object({
    code: nonEmptyString("Please enter your recovery code"),
  })
)

export type RecoveryCodeFormValues = z.infer<typeof RecoveryCodeSchema>
