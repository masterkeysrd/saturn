import { describe, it, expect } from "vitest"
import { ComposeMailSchema, SendMailSchema } from "./index"

describe("ComposeMailSchema", () => {
  it("validates a draft with valid connectedAccountId", () => {
    const valid = {
      connectedAccountId: "acc_google_1",
      to: [{ email: "recipient@example.com", displayName: "Recipient" }],
      subject: "Hello",
      bodyHtml: "<p>World</p>",
    }

    const res = ComposeMailSchema.safeParse(valid)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.connectedAccountId).toBe("acc_google_1")
      expect(res.data.to).toHaveLength(1)
      expect(res.data.to[0].email).toBe("recipient@example.com")
    }
  })

  it("rejects draft without connectedAccountId", () => {
    const invalid = {
      connectedAccountId: "",
      to: [],
      subject: "No Account",
    }

    const res = ComposeMailSchema.safeParse(invalid)
    expect(res.success).toBe(false)
  })

  it("rejects invalid email address in to array", () => {
    const invalid = {
      connectedAccountId: "acc_google_1",
      to: [{ email: "not-an-email" }],
    }

    const res = ComposeMailSchema.safeParse(invalid)
    expect(res.success).toBe(false)
  })
})

describe("SendMailSchema", () => {
  it("allows sending when at least one recipient exists in To", () => {
    const valid = {
      connectedAccountId: "acc_google_1",
      to: [{ email: "valid@example.com" }],
      subject: "Ready",
    }

    const res = SendMailSchema.safeParse(valid)
    expect(res.success).toBe(true)
  })

  it("allows sending when recipient is only in Bcc", () => {
    const valid = {
      connectedAccountId: "acc_google_1",
      to: [],
      bcc: [{ email: "blind@example.com" }],
      subject: "Bcc Only",
    }

    const res = SendMailSchema.safeParse(valid)
    expect(res.success).toBe(true)
  })

  it("rejects sending when no recipients are provided", () => {
    const invalid = {
      connectedAccountId: "acc_google_1",
      to: [],
      cc: [],
      bcc: [],
      subject: "Empty",
    }

    const res = SendMailSchema.safeParse(invalid)
    expect(res.success).toBe(false)
  })
})
