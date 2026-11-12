import { z } from "zod"
import { nonEmptyString } from "../common"

export const MailRecipientSchema = z.object({
  email: z.string().trim().email({ error: "Invalid email address" }),
  displayName: z.string().trim().optional().default(""),
})

export type MailRecipientFormValues = z.infer<typeof MailRecipientSchema>

export const MailAttachmentMetaSchema = z.object({
  id: z.string().optional().default(""),
  filename: z.string().trim().min(1, { error: "Filename is required" }),
  contentType: z.string().trim().default("application/octet-stream"),
  size: z.union([z.number(), z.string()]).default(0),
  contentId: z.string().optional().default(""),
  isInline: z.boolean().optional().default(false),
  downloadUrl: z.string().optional().default(""),
})

export type MailAttachmentMetaFormValues = z.infer<
  typeof MailAttachmentMetaSchema
>

export const ComposeMailSchema = z.compile(
  z.object({
    connectedAccountId: nonEmptyString("Connected account is required"),
    to: z.array(MailRecipientSchema).default([]),
    cc: z.array(MailRecipientSchema).default([]),
    bcc: z.array(MailRecipientSchema).default([]),
    subject: z.string().trim().max(1000).default(""),
    bodyHtml: z.string().default(""),
    bodyText: z.string().default(""),
    threadId: z.string().trim().optional().default(""),
    replyToMessageId: z.string().trim().optional().default(""),
    mode: z
      .enum([
        "DRAFT_MODE_UNSPECIFIED",
        "DRAFT_MODE_NEW",
        "DRAFT_MODE_REPLY",
        "DRAFT_MODE_REPLY_ALL",
        "DRAFT_MODE_FORWARD",
      ])
      .default("DRAFT_MODE_NEW"),
    attachments: z.array(MailAttachmentMetaSchema).default([]),
  })
)

export type ComposeMailValues = z.infer<typeof ComposeMailSchema>

/**
 * Validation schema specifically for sending an email, requiring at least one valid recipient in To, Cc, or Bcc.
 */
export const SendMailSchema = ComposeMailSchema.refine(
  (data) => data.to.length > 0 || data.cc.length > 0 || data.bcc.length > 0,
  {
    error: "At least one recipient is required to send",
    path: ["to"],
  }
)
