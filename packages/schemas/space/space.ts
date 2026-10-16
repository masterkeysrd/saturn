import { z } from "zod"
import { nonEmptyString } from "../common"

export const CreateSpaceSchema = z.compile(
  z.object({
    name: nonEmptyString("Workspace name is required").max(100, {
      error: "Workspace name cannot exceed 100 characters",
    }),
    description: z
      .string()
      .trim()
      .max(500, { error: "Description cannot exceed 500 characters" })
      .optional(),
  })
)
export type CreateSpaceFormValues = z.infer<typeof CreateSpaceSchema>

export const SpaceDetailsSchema = z.compile(
  z.object({
    name: nonEmptyString("Space name is required").max(255, {
      error: "Space name cannot exceed 255 characters",
    }),
    description: z.string().optional(),
  })
)
export type SpaceDetailsFormValues = z.infer<typeof SpaceDetailsSchema>

export const AddMemberSchema = z.compile(
  z.object({
    userId: nonEmptyString("User ID is required"),
    role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
  })
)
export type AddMemberFormValues = z.infer<typeof AddMemberSchema>
