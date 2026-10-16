import { z } from "zod"

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
})

export type LoginFormValues = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  username: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

export type RegisterFormValues = z.infer<typeof registerSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
    totpCode: z.string().optional(),
    revokeOtherSessions: z.boolean(),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password cannot be the same as your current password",
    path: ["newPassword"],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

export const serverSettingsSchema = z.object({
  serverUrl: z.string().trim().min(1, "Server URL is required"),
})

export type ServerSettingsFormValues = z.infer<typeof serverSettingsSchema>

export const mfaStepUpSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, "Please enter all 6 digits")
    .regex(/^\d+$/, "Code must contain only numbers"),
})

export type MfaStepUpFormValues = z.infer<typeof mfaStepUpSchema>

export const recoveryCodeSchema = z.object({
  code: z.string().trim().min(1, "Please enter your recovery code"),
})

export type RecoveryCodeFormValues = z.infer<typeof recoveryCodeSchema>
