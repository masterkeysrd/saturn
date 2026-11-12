import { describe, it, expect } from "vitest"
import {
  normalizeReplySubject,
  normalizeForwardSubject,
  formatParticipantDisplay,
  computeReplyRecipients,
  buildQuotedReplyHtml,
  formatAttachmentBytes,
} from "./format"

describe("normalizeReplySubject", () => {
  it("prepends Re: to standard subject", () => {
    expect(normalizeReplySubject("Weekly Sync")).toBe("Re: Weekly Sync")
  })

  it("is idempotent with existing Re: prefixes of various casings", () => {
    expect(normalizeReplySubject("Re: Weekly Sync")).toBe("Re: Weekly Sync")
    expect(normalizeReplySubject("re: Weekly Sync")).toBe("Re: Weekly Sync")
    expect(normalizeReplySubject("RE: Weekly Sync")).toBe("Re: Weekly Sync")
    expect(normalizeReplySubject("Re: Re: Re: Weekly Sync")).toBe(
      "Re: Weekly Sync"
    )
    expect(normalizeReplySubject("Fwd: Re: Weekly Sync")).toBe(
      "Re: Weekly Sync"
    )
  })

  it("handles empty or whitespace subject", () => {
    expect(normalizeReplySubject("")).toBe("Re: ")
    expect(normalizeReplySubject(undefined)).toBe("Re: ")
  })
})

describe("normalizeForwardSubject", () => {
  it("prepends Fwd: to standard subject", () => {
    expect(normalizeForwardSubject("Project Update")).toBe(
      "Fwd: Project Update"
    )
  })

  it("is idempotent with existing Fwd: or Fw: prefixes", () => {
    expect(normalizeForwardSubject("Fwd: Project Update")).toBe(
      "Fwd: Project Update"
    )
    expect(normalizeForwardSubject("fwd: Project Update")).toBe(
      "Fwd: Project Update"
    )
    expect(normalizeForwardSubject("FW: Project Update")).toBe(
      "Fwd: Project Update"
    )
    expect(normalizeForwardSubject("Fw: Fwd: Project Update")).toBe(
      "Fwd: Project Update"
    )
    expect(normalizeForwardSubject("Re: Project Update")).toBe(
      "Fwd: Project Update"
    )
  })
})

describe("formatParticipantDisplay", () => {
  it("formats participant with display name", () => {
    expect(
      formatParticipantDisplay({
        displayName: "Sarah Connor",
        email: "sarah@example.com",
      })
    ).toBe("Sarah Connor <sarah@example.com>")
  })

  it("formats participant with empty name or same name as email", () => {
    expect(formatParticipantDisplay({ email: "sarah@example.com" })).toBe(
      "sarah@example.com"
    )
    expect(
      formatParticipantDisplay({
        displayName: "sarah@example.com",
        email: "sarah@example.com",
      })
    ).toBe("sarah@example.com")
  })
})

describe("computeReplyRecipients", () => {
  const me = "me@company.com"
  const myAlias = "alias@company.com"
  const selfEmails = [me, myAlias]

  const sender = { email: "sender@example.com", displayName: "Sender" }
  const toRecipient1 = { email: "alice@example.com", displayName: "Alice" }
  const toRecipient2 = { email: "me@company.com", displayName: "Me" }
  const ccRecipient1 = { email: "bob@example.com", displayName: "Bob" }
  const ccRecipient2 = { email: "alias@company.com", displayName: "My Alias" }

  it("handles single Reply to sender, ignoring CC and To", () => {
    const result = computeReplyRecipients({
      replyType: "reply",
      from: sender,
      to: [toRecipient1, toRecipient2],
      cc: [ccRecipient1],
      selfEmails,
    })

    expect(result.to).toEqual([sender])
    expect(result.cc).toEqual([])
  })

  it("handles Reply-All with self-exclusion across aliases and deduplication", () => {
    const result = computeReplyRecipients({
      replyType: "reply-all",
      from: sender,
      to: [toRecipient1, toRecipient2, sender], // sender duplicated in To, me in To
      cc: [ccRecipient1, ccRecipient2, toRecipient1], // toRecipient1 in Cc, alias in Cc
      selfEmails,
    })

    // To should have sender, alice (me is excluded, duplicate sender ignored)
    expect(result.to).toEqual([sender, toRecipient1])
    // Cc should have bob (alias is excluded, alice was already in To)
    expect(result.cc).toEqual([ccRecipient1])
  })

  it("preserves self when replying to self-sent email", () => {
    const result = computeReplyRecipients({
      replyType: "reply",
      from: { email: me, displayName: "Me" },
      to: [{ email: me }],
      selfEmails,
    })

    expect(result.to).toHaveLength(1)
    expect(result.to[0].email).toBe(me)
  })
})

describe("buildQuotedReplyHtml", () => {
  it("builds quoted HTML with escaped characters and date", () => {
    const html = buildQuotedReplyHtml({
      from: { displayName: "Alice & Bob <script>", email: "alice@example.com" },
      sentAt: "2026-10-20T14:30:00Z",
      bodyHtml: "<p>Hello <b>World</b></p>",
    })

    expect(html).toContain(
      "Alice &amp; Bob &lt;script&gt; &lt;alice@example.com&gt; wrote:"
    )
    expect(html).toContain("<blockquote")
    expect(html).toContain("<p>Hello <b>World</b></p>")
    expect(html).not.toContain("<script>")
  })

  it("converts plaintext body to HTML breaks with escaping", () => {
    const html = buildQuotedReplyHtml({
      from: { email: "bob@example.com" },
      bodyText: "Line 1\nLine 2 & <tag>",
    })

    expect(html).toContain("bob@example.com wrote:")
    expect(html).toContain("Line 1<br>Line 2 &amp; &lt;tag&gt;")
  })
})

describe("formatAttachmentBytes", () => {
  it("formats byte sizes correctly", () => {
    expect(formatAttachmentBytes(0)).toBe("0 B")
    expect(formatAttachmentBytes(500)).toBe("500 B")
    expect(formatAttachmentBytes(1024)).toBe("1 KB")
    expect(formatAttachmentBytes(1536)).toBe("1.5 KB")
    expect(formatAttachmentBytes(1024 * 1024 * 24.5)).toBe("24.5 MB")
    expect(formatAttachmentBytes(1024 * 1024 * 1024 * 2)).toBe("2 GB")
  })
})
