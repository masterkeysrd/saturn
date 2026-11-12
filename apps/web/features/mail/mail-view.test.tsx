import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MailView } from "./mail-view"
import * as hooks from "@saturn/hooks"
import type { Thread, Mailbox } from "@saturn/api/saturn/mail/v1/mail"

const mockAccounts = [
  {
    id: "acc_work",
    displayName: "Work Account",
    email: "work@company.com",
    provider: "google",
    color: "#3b82f6",
    enabledCapabilities: ["mail", "calendar"],
  },
  {
    id: "acc_personal",
    displayName: "Personal Account",
    email: "personal@gmail.com",
    provider: "google",
    color: "#10b981",
    enabledCapabilities: ["mail"],
  },
]

const mockMailboxes: Mailbox[] = [
  {
    id: "mbx_inbox_1",
    spaceId: "sp_1",
    connectedAccountId: "acc_work",
    providerMailboxId: "INBOX",
    name: "Inbox",
    systemRole: "MAILBOX_ROLE_INBOX",
    color: "#3b82f6",
    unreadCount: 3,
    totalCount: 15,
    createTime: "2026-10-01T00:00:00Z",
    updateTime: "2026-10-01T00:00:00Z",
  },
]

const mockThreads: Thread[] = [
  {
    id: "mth_101",
    spaceId: "sp_1",
    connectedAccountId: "acc_work",
    providerThreadId: "p_101",
    subject: "Q3 Budget Review",
    snippet: "Please see attached budget figures for review.",
    participants: [
      { name: "Finance Lead", email: "finance@company.com" },
      { name: "Work Account", email: "work@company.com" },
    ],
    messageCount: 1,
    hasAttachments: true,
    isUnread: true,
    isStarred: false,
    inInbox: true,
    inSent: false,
    inDrafts: false,
    inTrash: false,
    inSpam: false,
    mailboxIds: ["mbx_inbox_1"],
    lastMessageAt: "2026-10-20T10:00:00Z",
    createTime: "2026-10-20T10:00:00Z",
    updateTime: "2026-10-20T10:00:00Z",
    messages: [
      {
        id: "msg_101_1",
        spaceId: "sp_1",
        connectedAccountId: "acc_work",
        threadId: "mth_101",
        providerMessageId: "p_msg_101",
        rfcMessageId: "<msg101@company.com>",
        inReplyTo: "",
        references: "",
        subject: "Q3 Budget Review",
        snippet: "Please see attached budget figures for review.",
        from: { name: "Finance Lead", email: "finance@company.com" },
        to: [{ name: "Work Account", email: "work@company.com" }],
        cc: [],
        bcc: [],
        replyTo: [],
        sentAt: "2026-10-20T10:00:00Z",
        receivedAt: "2026-10-20T10:01:00Z",
        isUnread: true,
        isStarred: false,
        isDraft: false,
        attachments: [
          {
            id: "att_budget_1",
            filename: "Q3_Budget.xlsx",
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            size: "15360",
            contentId: "",
            isInline: false,
            downloadUrl: "/api/v1/mail/attachments/token_1",
          },
        ],
        hasRemoteImages: true,
        bodyCached: true,
        bodyHtml:
          '<p>Hello,</p><p>Please review.</p><img data-saturn-remote-src="https://tracker.company.com/pixel.png">',
        bodyPlain: "Hello,\nPlease review.",
        createTime: "2026-10-20T10:00:00Z",
        updateTime: "2026-10-20T10:00:00Z",
      },
    ],
  },
]

describe("MailView Web Feature", () => {
  let queryClient: QueryClient

  const mockModifyThreadMutate = vi.fn()
  const mockSaveDraftMutateAsync = vi
    .fn()
    .mockResolvedValue({ id: "mdf_new_1" })
  const mockSendDraftMutateAsync = vi
    .fn()
    .mockResolvedValue({ id: "msg_sent_1" })

  beforeEach(() => {
    vi.clearAllMocks()
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

    vi.spyOn(hooks, "useCalendars").mockReturnValue({
      data: {
        calendars: [
          {
            id: "cal_1",
            name: "Work Calendar",
            description: "Work meetings",
            color: "#3b82f6",
            timezone: "UTC",
            isEnabled: true,
            source: "CALENDAR_SOURCE_NATIVE",
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useCalendars>)

    vi.spyOn(hooks, "useMailboxes").mockReturnValue({
      data: { mailboxes: mockMailboxes },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useMailboxes>)

    vi.spyOn(hooks, "useMailThreads").mockReturnValue({
      data: { threads: mockThreads, nextPageToken: "" },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useMailThreads>)

    vi.spyOn(hooks, "useMailThread").mockImplementation((threadId) => {
      const match = mockThreads.find((t) => t.id === threadId) || mockThreads[0]
      return {
        data: match,
        isLoading: false,
      } as unknown as ReturnType<typeof hooks.useMailThread>
    })

    vi.spyOn(hooks, "useModifyThread").mockReturnValue({
      mutate: mockModifyThreadMutate,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useModifyThread>)

    vi.spyOn(hooks, "useBatchModifyThreads").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useBatchModifyThreads>)

    vi.spyOn(hooks, "useSaveDraft").mockReturnValue({
      mutateAsync: mockSaveDraftMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useSaveDraft>)

    vi.spyOn(hooks, "useSendDraft").mockReturnValue({
      mutateAsync: mockSendDraftMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useSendDraft>)

    vi.spyOn(hooks, "useContactSuggestions").mockReturnValue({
      data: {
        contacts: [
          { email: "colleague@example.com", displayName: "Colleague Friend" },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useContactSuggestions>)
  })

  function createWrapper() {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      )
    }
  }

  it("renders 3-pane layout with mailbox rail, thread list, and thread reader", () => {
    render(<MailView />, { wrapper: createWrapper() })

    expect(screen.getByTestId("mailbox-rail")).toBeDefined()
    expect(screen.getByTestId("thread-list-pane")).toBeDefined()
    expect(screen.getByTestId("thread-reader-pane")).toBeDefined()
    expect(screen.getByTestId("thread-subject-heading").textContent).toContain(
      "Q3 Budget Review"
    )
  })

  it("sandboxes email iframe without allow-same-origin or allow-scripts attributes", () => {
    render(<MailView />, { wrapper: createWrapper() })

    const iframe = screen.getByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement
    expect(iframe).toBeDefined()

    const sandbox = iframe.getAttribute("sandbox") || ""
    expect(sandbox).toContain("allow-popups")
    // Strict isolation: must never permit both same-origin and scripts
    expect(sandbox).not.toContain("allow-scripts")
    expect(sandbox).not.toContain("allow-same-origin")
    expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer")
  })

  it("shows remote-image blocker banner and swaps to loaded src when opted in", () => {
    render(<MailView />, { wrapper: createWrapper() })

    // Banner should be visible initially because message has remote images
    const banner = screen.getByTestId("remote-images-banner")
    expect(banner).toBeDefined()
    expect(banner.textContent).toContain("Remote images are blocked")

    const iframeBefore = screen.getByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement
    expect(iframeBefore.srcdoc).toContain("data-saturn-remote-src")

    // Click "Load images"
    const loadBtn = screen.getByTestId("load-remote-images-btn")
    fireEvent.click(loadBtn)

    // Banner dismissed and data-saturn-remote-src replaced with src
    expect(screen.queryByTestId("remote-images-banner")).toBeNull()
    const iframeAfter = screen.getByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement
    expect(iframeAfter.srcdoc).toContain(
      'src="https://tracker.company.com/pixel.png"'
    )
  })

  it("switches account filter between All Accounts and specific ConnectedAccount", () => {
    render(<MailView />, { wrapper: createWrapper() })

    // Click specific account
    const workAccBtn = screen.getByTestId("account-filter-acc_work")
    fireEvent.click(workAccBtn)

    expect(hooks.useMailThreads).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: "acc_work" })
    )

    // Click All Accounts
    const allAccBtn = screen.getByTestId("account-filter-all")
    fireEvent.click(allAccBtn)

    expect(hooks.useMailThreads).toHaveBeenLastCalledWith(
      expect.objectContaining({ connectedAccountId: "" })
    )
  })

  it("opens docked composer and sends email with recipient", async () => {
    render(<MailView />, { wrapper: createWrapper() })

    // Open Compose modal
    const composeBtn = screen.getByTestId("compose-btn")
    fireEvent.click(composeBtn)

    expect(screen.getByTestId("mail-compose-modal")).toBeDefined()

    // Add recipient
    const toInput = screen.getByTestId("to-input")
    fireEvent.change(toInput, { target: { value: "client@example.com" } })
    fireEvent.keyDown(toInput, { key: "Enter" })

    // Add subject
    const subjectInput = screen.getByTestId("composer-subject-input")
    fireEvent.change(subjectInput, { target: { value: "Proposal Discussion" } })

    // Send
    const sendBtn = screen.getByTestId("composer-send-btn")
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(mockSaveDraftMutateAsync).toHaveBeenCalled()
      expect(mockSendDraftMutateAsync).toHaveBeenCalled()
    })
  })

  it("opens Create Calendar Event dialog pre-populated with email thread details", async () => {
    render(<MailView />, { wrapper: createWrapper() })

    // Click Create Event button in header
    const createEventBtn = screen.getByTestId("create-calendar-event-btn")
    fireEvent.click(createEventBtn)

    // Event dialog should open
    await waitFor(() => {
      expect(screen.getByTestId("event-title-input")).toBeDefined()
    })

    // Title input should be pre-filled with email subject
    const titleInput = screen.getByTestId(
      "event-title-input"
    ) as HTMLInputElement
    expect(titleInput.value).toBe("Q3 Budget Review")
  })
})
