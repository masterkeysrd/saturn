import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as hooks from "@saturn/hooks"
import { MailComposer } from "./mail-composer"

const mockAccounts = [
  {
    id: "acc_work",
    displayName: "Work Account",
    email: "work@company.com",
    provider: "google",
    color: "#3b82f6",
    enabledCapabilities: ["mail"],
  },
]

function getEditorDocument(testId = "reply-editor-content"): Document {
  const iframe = screen.getByTestId(testId) as HTMLIFrameElement
  const doc = iframe.contentDocument
  if (!doc) {
    throw new Error("Expected composer iframe contentDocument to exist")
  }
  return doc
}

describe("MailComposer", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.spyOn(hooks, "useConnectedAccounts").mockReturnValue({
      data: { accounts: mockAccounts },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useConnectedAccounts>)

    vi.spyOn(hooks, "useContactSuggestions").mockReturnValue({
      data: { contacts: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useContactSuggestions>)
  })

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  it("renders plain-text draft bodyText with paragraphs instead of collapsing lines", () => {
    render(
      <MailComposer
        isInlineReply={true}
        defaultTo={[{ email: "alice@example.com", displayName: "Alice" }]}
        defaultBodyHtml=""
        defaultBodyText={"Line one\nLine two"}
        onSend={vi.fn()}
      />,
      { wrapper }
    )

    const doc = getEditorDocument()
    const paragraphs = doc.body.querySelectorAll("p")
    expect(paragraphs.length).toBe(2)
    expect(paragraphs[0].textContent).toBe("Line one")
    expect(paragraphs[1].textContent).toBe("Line two")
  })

  it("unwraps <pre style='white-space: pre-wrap;'> draft HTML into normal paragraphs", () => {
    render(
      <MailComposer
        isInlineReply={true}
        defaultTo={[{ email: "alice@example.com", displayName: "Alice" }]}
        defaultBodyHtml={
          '<pre style="white-space: pre-wrap;">Hello team,\n\nRegards</pre>'
        }
        onSend={vi.fn()}
      />,
      { wrapper }
    )

    const doc = getEditorDocument()
    expect(doc.body.querySelector("pre")).toBeNull()
    expect(doc.body.textContent).toContain("Hello team,")
    expect(doc.body.textContent).toContain("Regards")
  })

  it("preserves sanitized remote images and loads them when user clicks Show images", () => {
    render(
      <MailComposer
        isInlineReply={true}
        defaultTo={[{ email: "alice@example.com", displayName: "Alice" }]}
        defaultBodyHtml={
          '<p>Draft with image</p><img data-saturn-remote-src="https://cdn.example.com/banner.png" alt="Banner">'
        }
        onSend={vi.fn()}
      />,
      { wrapper }
    )

    expect(screen.getByTestId("composer-remote-images-banner")).toBeDefined()
    const doc = getEditorDocument()
    const imgBefore = doc.body.querySelector("img")
    expect(imgBefore).not.toBeNull()
    expect(imgBefore?.getAttribute("data-saturn-remote-src")).toBe(
      "https://cdn.example.com/banner.png"
    )
    expect(imgBefore?.getAttribute("src")).toBeNull()

    fireEvent.click(screen.getByTestId("composer-load-remote-images-btn"))

    expect(screen.queryByTestId("composer-remote-images-banner")).toBeNull()
    const imgAfter = doc.body.querySelector("img")
    expect(imgAfter?.getAttribute("src")).toBe(
      "https://cdn.example.com/banner.png"
    )
  })

  it("allows editing forwarded HTML directly inside unified contentEditable editor and sends edited HTML", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(
      <MailComposer
        isInlineReply={true}
        defaultTo={[{ email: "alice@example.com", displayName: "Alice" }]}
        defaultSubject="Fwd: Amazon"
        defaultBodyHtml={
          '<style>.amazon-center { text-align: center; }</style><blockquote type="cite"><div>Begin forwarded message:</div><div>From: "Amazon.com" &lt;store-news@amazon.com&gt;</div><div>To: morales.david1997@gmail.com</div><center><table align="center" width="600" border="0"><tr><td align="center">Original Deal</td></tr></table></center></blockquote>'
        }
        onSend={onSend}
      />,
      { wrapper }
    )

    const doc = getEditorDocument()
    expect(doc.body.getAttribute("contenteditable")).toBe("true")
    expect(doc.head.innerHTML).toContain(
      ".amazon-center { text-align: center; }"
    )
    expect(doc.body.querySelector("center")).not.toBeNull()
    expect(doc.body.querySelector("table")?.getAttribute("align")).toBe(
      "center"
    )
    expect(doc.body.innerHTML).toContain('href="mailto:store-news@amazon.com"')
    expect(doc.body.innerHTML).toContain(
      'href="mailto:morales.david1997@gmail.com"'
    )

    // Edit forwarded content directly in the unified body
    const td = doc.body.querySelector("td")
    if (td) td.textContent = "Edited Deal"
    fireEvent.input(doc.body)

    fireEvent.click(screen.getByTestId("composer-send-btn"))
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyHtml: expect.stringContaining("Edited Deal"),
        })
      )
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({
          bodyHtml: expect.stringContaining(".amazon-center"),
        })
      )
    })
  })

  it("routes unified toolbar formatting buttons to the contentEditable iframe document", () => {
    render(
      <MailComposer
        isInlineReply={true}
        defaultTo={[{ email: "alice@example.com", displayName: "Alice" }]}
        defaultBodyHtml="<p>Hello</p>"
        onSend={vi.fn()}
      />,
      { wrapper }
    )

    const doc = getEditorDocument()
    const execSpy = vi.fn().mockReturnValue(true)
    doc.execCommand = execSpy

    fireEvent.click(screen.getByRole("button", { name: "Bold" }))
    fireEvent.click(screen.getByRole("button", { name: "Italic" }))
    fireEvent.click(screen.getByRole("button", { name: "Underline" }))
    fireEvent.click(screen.getByRole("button", { name: "Bullet list" }))

    expect(execSpy).toHaveBeenCalledWith("bold")
    expect(execSpy).toHaveBeenCalledWith("italic")
    expect(execSpy).toHaveBeenCalledWith("underline")
    expect(execSpy).toHaveBeenCalledWith("insertUnorderedList")
  })

  it("enforces editor padding after email styles and autofocuses editor when autoFocusEditor is true", async () => {
    render(
      <MailComposer
        isInlineReply={true}
        autoFocusEditor={true}
        defaultTo={[{ email: "alice@example.com", displayName: "Alice" }]}
        defaultBodyHtml="<style>body { padding: 0 !important; }</style><p>Reply here</p>"
        onSend={vi.fn()}
      />,
      { wrapper }
    )

    const doc = getEditorDocument()
    expect(doc.head.innerHTML).toContain("padding: 14px 18px !important;")

    const focusSpy = vi.spyOn(doc.body, "focus")
    await waitFor(() => {
      expect(focusSpy).toHaveBeenCalled()
    })
  })
})
