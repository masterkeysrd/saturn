import { describe, it, expect } from "vitest"
import {
  normalizeReplySubject,
  normalizeForwardSubject,
  formatParticipantDisplay,
  formatThreadParticipants,
  computeReplyRecipients,
  buildQuotedReplyHtml,
  buildForwardedMessageHtml,
  formatAttachmentBytes,
  prepareDraftContentForEditor,
  splitQuotedEmailHtml,
  combineDraftBodyHtml,
  stripHtmlToPlainText,
  prepareUnifiedDraftHtml,
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
    expect(
      formatParticipantDisplay({
        name: "Sarah Connor",
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

describe("formatThreadParticipants", () => {
  const me = "david@company.com"
  const selfEmails = [me]

  it("filters out the user account email on incoming emails leaving only external sender", () => {
    const participants = [
      { name: "DOMEX EXPRESO S R L", email: "DOMEX_EXPRESO_SRL@webpossrl.com" },
      { name: "David Morales", email: "david@company.com" },
    ]

    expect(formatThreadParticipants({ participants, selfEmails })).toBe(
      "DOMEX EXPRESO S R L"
    )
  })

  it("shows all external correspondents on multi-recipient threads without user account name", () => {
    const participants = [
      { name: "Alice Smith", email: "alice@external.com" },
      { name: "Bob Jones", email: "bob@external.com" },
      { name: "David Morales", email: "david@company.com" },
    ]

    expect(formatThreadParticipants({ participants, selfEmails })).toBe(
      "Alice Smith, Bob Jones"
    )
  })

  it("prepends 'To: ' when viewing threads in Sent bucket", () => {
    const participants = [
      { name: "David Morales", email: "david@company.com" },
      { name: "Client Corp", email: "contact@client.com" },
    ]

    expect(
      formatThreadParticipants({
        participants,
        selfEmails,
        isSentBucket: true,
      })
    ).toBe("To: Client Corp")
  })

  it("gracefully falls back to 'Me' when user sends an email solely to themselves", () => {
    const participants = [{ name: "David Morales", email: "david@company.com" }]

    expect(
      formatThreadParticipants({
        participants,
        selfEmails,
        isSentBucket: true,
      })
    ).toBe("Me")

    expect(
      formatThreadParticipants({
        participants,
        selfEmails,
        isSentBucket: false,
      })
    ).toBe("David Morales")
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

describe("buildForwardedMessageHtml", () => {
  it("builds standard forwarded message block with metadata and sanitized body", () => {
    const html = buildForwardedMessageHtml({
      from: { displayName: "Jane Doe", email: "jane@company.com" },
      to: [{ displayName: "Bob Smith", email: "bob@company.com" }],
      cc: [{ displayName: "Charlie", email: "charlie@company.com" }],
      subject: "Annual Plan",
      sentAt: "2026-10-20T14:30:00Z",
      bodyHtml:
        "<html><head><style>body { color: black; }</style></head><body><div style='color: #000000; background-color: #ffffff;'><p>Proposal details here</p></div></body></html>",
    })

    expect(html).toContain("---------- Forwarded message ---------")
    expect(html).toContain("<b>From:</b> Jane Doe &lt;jane@company.com&gt;")
    expect(html).toContain("<b>To:</b> Bob Smith &lt;bob@company.com&gt;")
    expect(html).toContain("<b>Cc:</b> Charlie &lt;charlie@company.com&gt;")
    expect(html).toContain("<b>Subject:</b> Annual Plan")
    expect(html).toContain("Proposal details here")
    // Verifies sanitization of styles and dark text colors
    expect(html).not.toContain("<head>")
    expect(html).not.toContain("<style>")
    expect(html).toContain("color: inherit;")
    expect(html).toContain("background-color: transparent;")
  })

  it("resolves cid: inline attachments in forwarded message body", () => {
    const html = buildForwardedMessageHtml({
      from: { email: "sender@company.com" },
      subject: "Image test",
      bodyHtml: `<p>Hello <img src="cid:logo.png"></p>`,
      attachments: [
        {
          contentId: "<logo.png>",
          filename: "logo.png",
          isInline: true,
          downloadUrl: "https://saturn.test/files/logo_123.png",
        },
      ],
    })

    expect(html).toContain('<img src="https://saturn.test/files/logo_123.png">')
    expect(html).not.toContain("cid:logo.png")
  })

  it("handles plaintext body with newline conversions", () => {
    const html = buildForwardedMessageHtml({
      from: { email: "plain@company.com" },
      subject: "Notes",
      bodyText: "First line\nSecond line",
    })

    expect(html).toContain("<b>From:</b> plain@company.com")
    expect(html).toContain("<b>Subject:</b> Notes")
    expect(html).toContain("First line<br>Second line")
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

describe("prepareDraftContentForEditor", () => {
  it("converts plain-text bodyText fallback into escaped paragraph HTML", () => {
    const res = prepareDraftContentForEditor({
      bodyHtml: "",
      bodyText: "Hello <World>\n\nLine 2 & more",
    })

    expect(res.editableHtml).toBe(
      "<p>Hello &lt;World&gt;</p><p><br></p><p>Line 2 &amp; more</p>"
    )
    expect(res.quotedHtml).toBe("")
    expect(res.hasRemoteImages).toBe(false)
  })

  it("unwraps <pre style='white-space: pre-wrap;'> plain-text wrappers into paragraphs", () => {
    const res = prepareDraftContentForEditor({
      bodyHtml:
        '<pre style="white-space: pre-wrap;">Hi team,\n\nSee &lt;attached&gt;.</pre>',
    })

    expect(res.editableHtml).toBe(
      "<p>Hi team,</p><p><br></p><p>See &lt;attached&gt;.</p>"
    )
  })

  it("preserves explicit code blocks with <code> inside <pre>", () => {
    const res = prepareDraftContentForEditor({
      bodyHtml:
        '<pre style="white-space: pre-wrap;"><code>const x = 1;</code></pre>',
    })

    expect(res.editableHtml).toContain("<code>const x = 1;</code>")
  })

  it("resolves cid: inline attachments and detects/restores data-saturn-remote-src", () => {
    const html =
      '<p>Hi <img src="cid:logo.png"> <img data-saturn-remote-src="https://cdn.test/img.png"></p>'
    const blocked = prepareDraftContentForEditor({
      bodyHtml: html,
      attachments: [
        {
          contentId: "<logo.png>",
          filename: "logo.png",
          isInline: true,
          downloadUrl: "/api/v1/mail/attachments/tok_1",
        },
      ],
      loadRemoteImages: false,
    })

    expect(blocked.hasRemoteImages).toBe(true)
    expect(blocked.editableHtml).toContain(
      'src="/api/v1/mail/attachments/tok_1"'
    )
    expect(blocked.editableHtml).toContain(
      'data-saturn-remote-src="https://cdn.test/img.png"'
    )

    const loaded = prepareDraftContentForEditor({
      bodyHtml: html,
      loadRemoteImages: true,
    })
    expect(loaded.editableHtml).toContain('src="https://cdn.test/img.png"')
  })

  it("splits trailing quoted reply and forwarded blocks cleanly", () => {
    const quoted = buildQuotedReplyHtml({
      from: { displayName: "Alice", email: "alice@example.com" },
      sentAt: "2026-10-20T14:30:00Z",
      bodyHtml: "<div><table><tr><td>Nested</td></tr></table></div>",
    })
    const res = prepareDraftContentForEditor({
      bodyHtml: `<p>My reply text</p>${quoted}`,
    })

    expect(res.editableHtml).toBe("<p>My reply text</p>")
    expect(res.quotedHtml).toContain('class="saturn-quoted-reply"')
    expect(res.quotedHtml).toContain("<table><tr><td>Nested</td></tr></table>")
  })

  it("handles quoted reply with no user text yet by returning empty editableHtml", () => {
    const quoted = buildQuotedReplyHtml({
      from: { email: "alice@example.com" },
      bodyHtml: "<p>Original</p>",
    })
    const res = prepareDraftContentForEditor({ bodyHtml: quoted })
    expect(res.editableHtml).toBe("")
    expect(res.quotedHtml).toContain('class="saturn-quoted-reply"')
  })

  it("does not split quoted block if meaningful content follows it", () => {
    const html =
      '<p>Top</p><div class="gmail_quote"><div>Quoted</div></div><p>Bottom note</p>'
    const res = splitQuotedEmailHtml(html)
    expect(res.editableHtml).toBe(html)
    expect(res.quotedHtml).toBe("")
  })

  it("extracts nested gmail_quote inside <div dir='ltr'> and preserves leading <style> for quotedHtml", () => {
    const html =
      '<style>.amazon-center { text-align: center; }</style><div dir="ltr">Check this order<br><div class="gmail_quote gmail_quote_container"><div>Order details</div></div></div>'
    const res = prepareDraftContentForEditor({ bodyHtml: html })

    expect(res.editableHtml).toBe('<div dir="ltr">Check this order</div>')
    expect(res.quotedHtml).toContain(
      "<style>.amazon-center { text-align: center; }</style>"
    )
    expect(res.quotedHtml).toContain("Order details")
  })

  it("extracts Apple Mail <blockquote type='cite'> forwards and linkifies header email addresses", () => {
    const html =
      '<div><br><blockquote type="cite"><div>Begin forwarded message:</div><br><div><b>From:</b> "Amazon.com" &lt;store-news@amazon.com&gt;</div><div><b>To:</b> morales.david1997@gmail.com</div><center><table><tr><td>Centered</td></tr></table></center></blockquote></div>'
    const res = prepareDraftContentForEditor({ bodyHtml: html })

    expect(res.editableHtml).toBe("")
    expect(res.quotedHtml).toContain('<blockquote type="cite">')
    expect(res.quotedHtml).toContain(
      '<a href="mailto:store-news@amazon.com">store-news@amazon.com</a>'
    )
    expect(res.quotedHtml).toContain(
      '<a href="mailto:morales.david1997@gmail.com">morales.david1997@gmail.com</a>'
    )
  })

  it("extracts unwrapped Begin forwarded message blocks inside outer wrappers", () => {
    const html =
      '<div dir="auto">FYI<br><br><div>Begin forwarded message:</div><div>From: "Amazon.com" &lt;store-news@amazon.com&gt;</div><div>Subject: Order</div><div>Date: Nov 13, 2026</div><div>To: morales.david1997@gmail.com</div><center><p>Deals</p></center></div>'
    const res = prepareDraftContentForEditor({ bodyHtml: html })

    expect(res.editableHtml).toBe('<div dir="auto">FYI</div>')
    expect(res.quotedHtml).toContain("Begin forwarded message:")
    expect(res.quotedHtml).toContain(
      '<a href="mailto:morales.david1997@gmail.com">morales.david1997@gmail.com</a>'
    )
  })
})

describe("combineDraftBodyHtml and stripHtmlToPlainText", () => {
  it("recombines editable HTML and preserved quoted HTML", () => {
    expect(
      combineDraftBodyHtml("<p>Reply</p>", '<div class="gmail_quote">Q</div>')
    ).toBe('<p>Reply</p><div class="gmail_quote">Q</div>')
    expect(combineDraftBodyHtml("<p>Only</p>", "")).toBe("<p>Only</p>")
  })

  it("strips HTML tags to readable plain text", () => {
    expect(
      stripHtmlToPlainText("<p>Hello &amp; welcome</p><p>Line 2</p>")
    ).toBe("Hello & welcome\nLine 2")
  })
})

describe("prepareUnifiedDraftHtml", () => {
  it("preserves full forwarded HTML, extracts styles, strips scripts, and linkifies emails", () => {
    const res = prepareUnifiedDraftHtml({
      bodyHtml:
        "<style>.a { color: red; }</style><script>alert(1)</script><div>Begin forwarded message:</div><div>To: user@example.com</div><center><table><tr><td>Deal</td></tr></table></center>",
    })

    expect(res.stylesHtml).toBe("<style>.a { color: red; }</style>")
    expect(res.isRichHtml).toBe(true)
    expect(res.bodyHtml).not.toContain("<script>")
    expect(res.bodyHtml).toContain(
      '<a href="mailto:user@example.com">user@example.com</a>'
    )
    expect(res.bodyHtml).toContain("<center><table>")
  })

  it("converts plain text fallback and marks simple emails as non-rich", () => {
    const res = prepareUnifiedDraftHtml({
      bodyHtml: "",
      bodyText: "Line A\nLine B",
    })

    expect(res.stylesHtml).toBe("")
    expect(res.isRichHtml).toBe(false)
    expect(res.bodyHtml).toBe("<p>Line A</p><p>Line B</p>")
  })
})
