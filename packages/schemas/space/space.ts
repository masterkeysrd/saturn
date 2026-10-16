import { z } from "zod"

export const createSpaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name is required")
    .max(100, "Workspace name cannot exceed 100 characters"),
  description: z
    .string()
    .trim()
    .max(500, "Description cannot exceed 500 characters")
    .optional(),
})

export type CreateSpaceFormValues = z.infer<typeof createSpaceSchema>

export const spaceDetailsSchema = z.object({
  name: z.string().trim().min(1, "Space name is required").max(255),
  description: z.string().optional(),
})

export type SpaceDetailsFormValues = z.infer<typeof spaceDetailsSchema>

export const addMemberSchema = z.object({
  userId: z.string().trim().min(1, "User ID is required"),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
})

export type AddMemberFormValues = z.infer<typeof addMemberSchema>
