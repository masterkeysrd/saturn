import { describe, it, expect } from "vitest"
import { restoreRemoteImageSrc, sanitizeEmailHtml } from "./html"

describe("sanitizeEmailHtml URI scheme sanitization", () => {
  it("preserves safe base64 raster data:image/* URIs on img src", () => {
    const inputs = [
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="png">',
      '<img src="data:image/jpeg;base64,/9j/4AAQSkZJRg==" alt="jpeg">',
      '<img src="data:image/jpg;base64,/9j/4AAQSkZJRg==" alt="jpg">',
      '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="gif">',
      '<img src="data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=" alt="webp">',
      '<img src="data:image/bmp;base64,Qk0=" alt="bmp">',
      '<img src="data:image/x-icon;base64,AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAABILAAASCwAAAAAAAAAAAAD///8A" alt="ico">',
      '<img src="data:image/vnd.microsoft.icon;base64,AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAABILAAASCwAAAAAAAAAAAAD///8A" alt="ms-ico">',
    ]

    for (const html of inputs) {
      const res = sanitizeEmailHtml(html)
      expect(res.html).toBe(html)
    }
  })

  it("strips SVG and non-base64/malformed data: URIs from img src", () => {
    const svgBase64 = sanitizeEmailHtml(
      '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+" alt="svg">'
    )
    expect(svgBase64.html).toBe('<img alt="svg">')
    expect(svgBase64.html).not.toContain("src=")

    const svgInline = sanitizeEmailHtml(
      '<img src="data:image/svg+xml,<svg onload=alert(1)>" alt="svg2">'
    )
    expect(svgInline.html).not.toContain("data:")
    expect(svgInline.html).not.toContain("src=")

    const nonBase64Png = sanitizeEmailHtml(
      '<img src="data:image/png,rawdata" alt="raw">'
    )
    expect(nonBase64Png.html).toBe('<img alt="raw">')

    const xhtmlSrc = sanitizeEmailHtml(
      '<img src="data:application/xhtml+xml;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">'
    )
    expect(xhtmlSrc.html).toBe("<img>")
  })

  it("strips all data: URIs on href, action, formaction, and poster", () => {
    const anchorPng = sanitizeEmailHtml(
      '<a href="data:image/png;base64,iVBORw0KGgo=">Download</a>'
    )
    expect(anchorPng.html).toBe("<a>Download</a>")

    const anchorHtml = sanitizeEmailHtml(
      '<a href="data:text/html,<script>alert(1)</script>">Click</a>'
    )
    expect(anchorHtml.html).toBe("<a>Click</a>")

    const formAction = sanitizeEmailHtml(
      '<form action="data:text/html,evil"><button formaction="data:image/png;base64,iVBORw0KGgo=">Submit</button></form>'
    )
    expect(formAction.html).toBe("<form><button>Submit</button></form>")

    const videoPoster = sanitizeEmailHtml(
      '<video poster="data:image/png;base64,iVBORw0KGgo="></video>'
    )
    expect(videoPoster.html).toBe("<video></video>")
  })

  it("rewrites loading=lazy to loading=eager, handles unquoted apostrophes, handles parens in CSS url(), and restores data-saturn-remote-style", () => {
    const amazonHtml =
      '<table summary=Amazon\'s width="640"><tr><td><style>.hero{background:url(\'https://m.media-amazon.com/images/G/30/hero_(1)_.jpg\')}</style><div style="background-image: url(\'https://m.media-amazon.com/images/G/30/deals_(1)_.jpg\'); padding: 12px;"><img data-saturn-remote-src="https://m.media-amazon.com/deal.jpg" loading="lazy" decoding="async" width="640"></div></td></tr></table>'

    const blocked = sanitizeEmailHtml(amazonHtml, { allowRemoteImages: false })
    expect(blocked.html).toContain("<table summary=Amazon's")
    expect(blocked.html).toContain("<td>")
    expect(blocked.html).toContain('loading="eager"')
    expect(blocked.html).not.toContain('loading="lazy"')
    expect(blocked.html).not.toContain('decoding="async"')
    expect(blocked.html).toContain(".hero{background:none}")
    expect(blocked.html).toContain(
      'style="background-image: none; padding: 12px;"'
    )
    expect(blocked.html).not.toContain("_.jpg')")

    const backendSanitized =
      '<div style="background-image: none; padding: 20px;" data-saturn-remote-style="background-image: url(\'//m.media-amazon.com/hero_(1)_.jpg\'); padding: 20px;"><img data-saturn-remote-src="https://m.media-amazon.com/deal.jpg" loading="lazy" decoding="async" width="640"></div>'
    const restored = restoreRemoteImageSrc(backendSanitized)
    expect(restored).toContain(
      "style=\"background-image: url('https://m.media-amazon.com/hero_(1)_.jpg'); padding: 20px;\""
    )
    expect(restored).not.toContain("data-saturn-remote-style")
    expect(restored).toContain('src="https://m.media-amazon.com/deal.jpg"')
    expect(restored).toContain('loading="eager"')
    expect(restored).not.toContain('loading="lazy"')
    expect(restored).not.toContain('decoding="async"')
  })
})
