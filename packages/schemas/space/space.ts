import { z } from "zod"
import { nonEmptyString } from "../common"
import { schemaError } from "../i18n"

export const CreateSpaceSchema = z.compile(
  z.object({
    name: nonEmptyString("space.workspaceNameRequired").max(100, {
      error: schemaError("space.workspaceNameMaxLength"),
    }),
    description: z
      .string()
      .trim()
      .max(500, {
        error: schemaError("space.descriptionMaxLength"),
      })
      .optional(),
  })
)
export type CreateSpaceFormValues = z.infer<typeof CreateSpaceSchema>

export const SpaceDetailsSchema = z.compile(
  z.object({
    name: nonEmptyString("space.spaceNameRequired").max(255, {
      error: schemaError("space.spaceNameMaxLength"),
    }),
    description: z.string().optional(),
  })
)
export type SpaceDetailsFormValues = z.infer<typeof SpaceDetailsSchema>

export const AddMemberSchema = z.compile(
  z.object({
    userId: nonEmptyString("space.userIdRequired"),
    role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
  })
)
export type AddMemberFormValues = z.infer<typeof AddMemberSchema>
