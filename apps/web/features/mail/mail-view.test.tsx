import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MailView } from "./mail-view"
import { MailUnreadBadge } from "./components/mail-unread-badge"
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
      {
        name: "Finance Lead",
        email: "finance@company.com",
        avatarUrl: "",
        isVerified: false,
      },
      {
        name: "Work Account",
        email: "work@company.com",
        avatarUrl: "",
        isVerified: false,
      },
    ],
    messageCount: 2,
    hasAttachments: true,
    isUnread: true,
    isStarred: false,
    inInbox: true,
    inSent: false,
    inDrafts: false,
    inTrash: false,
    inSpam: false,
    mailboxIds: ["mbx_inbox_1"],
    lastMessageAt: "2026-10-20T10:15:00Z",
    createTime: "2026-10-20T10:00:00Z",
    updateTime: "2026-10-20T10:15:00Z",
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
        from: {
          name: "Finance Lead",
          email: "finance@company.com",
          avatarUrl: "",
          isVerified: false,
        },
        to: [
          {
            name: "Work Account",
            email: "work@company.com",
            avatarUrl: "",
            isVerified: false,
          },
        ],
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
      {
        id: "msg_101_2",
        spaceId: "sp_1",
        connectedAccountId: "acc_work",
        threadId: "mth_101",
        providerMessageId: "p_msg_102",
        rfcMessageId: "<msg102@company.com>",
        inReplyTo: "<msg101@company.com>",
        references: "<msg101@company.com>",
        subject: "Re: Q3 Budget Review",
        snippet: "Thanks, looks good to me.",
        from: {
          name: "Work Account",
          email: "work@company.com",
          avatarUrl: "",
          isVerified: false,
        },
        to: [
          {
            name: "Finance Lead",
            email: "finance@company.com",
            avatarUrl: "",
            isVerified: false,
          },
        ],
        cc: [],
        bcc: [],
        replyTo: [],
        sentAt: "2026-10-20T10:15:00Z",
        receivedAt: "2026-10-20T10:16:00Z",
        isUnread: false,
        isStarred: false,
        isDraft: false,
        attachments: [],
        hasRemoteImages: false,
        bodyCached: true,
        bodyHtml: "<p>Thanks, looks good to me.</p>",
        bodyPlain: "Thanks, looks good to me.",
        createTime: "2026-10-20T10:15:00Z",
        updateTime: "2026-10-20T10:15:00Z",
      },
    ],
  },
  {
    id: "mth_draft_thread",
    spaceId: "sp_1",
    connectedAccountId: "acc_work",
    providerThreadId: "p_draft_1",
    subject: "Draft Proposal",
    snippet: "Proposal notes in progress...",
    participants: [
      {
        name: "Work Account",
        email: "work@company.com",
        avatarUrl: "",
        isVerified: false,
      },
    ],
    messageCount: 1,
    hasAttachments: false,
    isUnread: false,
    isStarred: false,
    inInbox: true,
    inSent: false,
    inDrafts: true,
    inTrash: false,
    inSpam: false,
    mailboxIds: ["mbx_inbox_1"],
    lastMessageAt: "2026-10-20T11:00:00Z",
    createTime: "2026-10-20T11:00:00Z",
    updateTime: "2026-10-20T11:00:00Z",
    messages: [
      {
        id: "msg_draft_1",
        spaceId: "sp_1",
        connectedAccountId: "acc_work",
        threadId: "mth_draft_thread",
        providerMessageId: "p_draft_msg_1",
        rfcMessageId: "<draft_msg1@company.com>",
        inReplyTo: "",
        references: "",
        subject: "Draft Proposal",
        snippet: "Proposal notes in progress...",
        from: {
          name: "Work Account",
          email: "work@company.com",
          avatarUrl: "",
          isVerified: false,
        },
        to: [
          {
            name: "Client Lead",
            email: "client@external.com",
            avatarUrl: "",
            isVerified: false,
          },
        ],
        cc: [],
        bcc: [],
        replyTo: [],
        sentAt: "",
        receivedAt: "",
        isUnread: false,
        isStarred: false,
        isDraft: true,
        attachments: [],
        hasRemoteImages: false,
        bodyCached: true,
        bodyHtml: "<p>Proposal notes in progress...</p>",
        bodyPlain: "Proposal notes in progress...",
        createTime: "2026-10-20T11:00:00Z",
        updateTime: "2026-10-20T11:00:00Z",
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
  const mockDeleteDraftMutateAsync = vi.fn().mockResolvedValue({})

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

    vi.spyOn(hooks, "useDeleteDraft").mockReturnValue({
      mutateAsync: mockDeleteDraftMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useDeleteDraft>)

    vi.spyOn(hooks, "useSyncConnectedAccount").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useSyncConnectedAccount>)

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

  it("renders 3-pane layout with mailbox rail, thread list, and empty thread reader by default", () => {
    render(<MailView />, { wrapper: createWrapper() })

    expect(screen.getByTestId("mailbox-rail")).toBeDefined()
    expect(screen.getByTestId("thread-list-pane")).toBeDefined()
    expect(screen.getByTestId("thread-reader-empty")).toBeDefined()

    // Clicking a conversation opens it in the reader pane
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))
    expect(screen.getByTestId("thread-reader-pane")).toBeDefined()
    expect(screen.getByTestId("thread-subject-heading").textContent).toContain(
      "Q3 Budget Review"
    )
  })

  it("sandboxes email iframe without allow-same-origin or allow-scripts attributes", () => {
    render(<MailView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))

    const [iframe] = screen.getAllByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement[]
    expect(iframe).toBeDefined()

    const sandbox = iframe.getAttribute("sandbox") || ""
    expect(sandbox).toContain("allow-popups")
    // Strict isolation: scripts must never be permitted in email bodies
    expect(sandbox).not.toContain("allow-scripts")
    expect(sandbox).toContain("allow-same-origin")
    expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer")
  })

  it("shows remote-image blocker banner and swaps to loaded src when opted in", () => {
    render(<MailView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))

    // Banner should be visible initially because message has remote images
    const banner = screen.getByTestId("remote-images-banner")
    expect(banner).toBeDefined()
    expect(banner.textContent).toContain("Remote images are blocked")

    const [iframeBefore] = screen.getAllByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement[]
    expect(iframeBefore.srcdoc).toContain("data-saturn-remote-src")

    // Click "Load images"
    const loadBtn = screen.getByTestId("load-remote-images-btn")
    fireEvent.click(loadBtn)

    // Banner dismissed and data-saturn-remote-src replaced with src
    expect(screen.queryByTestId("remote-images-banner")).toBeNull()
    const [iframeAfter] = screen.getAllByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement[]
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
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))

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

  it("expands all messages by default in short threads and toggles expand/collapse all", () => {
    render(<MailView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))

    // Both messages are visible in reader
    expect(screen.getByTestId("message-card-msg_101_1")).toBeDefined()
    expect(screen.getByTestId("message-card-msg_101_2")).toBeDefined()

    // Toggle button should be present for multi-message threads
    const toggleBtn = screen.getByTestId("toggle-expand-all-btn")
    expect(toggleBtn).toBeDefined()

    // Click toggle to collapse older messages
    fireEvent.click(toggleBtn)
    // Click toggle again to expand all
    fireEvent.click(toggleBtn)
  })

  it("supports always loading images across sessions via localStorage", () => {
    render(<MailView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))

    // Click "Always load" button
    const alwaysLoadBtn = screen.getByTestId("always-load-images-btn")
    fireEvent.click(alwaysLoadBtn)

    expect(localStorage.getItem("saturn_mail_auto_load_images")).toBe("true")

    const [iframeAfter] = screen.getAllByTestId(
      "sandboxed-email-frame"
    ) as HTMLIFrameElement[]
    expect(iframeAfter.srcdoc).toContain(
      'src="https://tracker.company.com/pixel.png"'
    )
  })

  it("renders sender avatar, header quick actions, and 3-dots menu", () => {
    render(<MailView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))

    // Sender avatars should render
    const avatars = screen.getAllByTestId("sender-avatar")
    expect(avatars.length).toBeGreaterThan(0)

    // Quick Reply and Forward buttons in message header
    const quickReplyBtn = screen.getByTestId("reply-quick-btn-msg_101_1")
    expect(quickReplyBtn).toBeDefined()

    const quickForwardBtn = screen.getByTestId("forward-quick-btn-msg_101_1")
    expect(quickForwardBtn).toBeDefined()

    // 3-dots more menu trigger
    const moreBtn = screen.getByTestId("message-more-btn-msg_101_1")
    expect(moreBtn).toBeDefined()
    fireEvent.click(moreBtn)

    // Dropdown options should be visible
    expect(screen.getByTestId("menu-reply-msg_101_1")).toBeDefined()
    expect(screen.getByTestId("menu-forward-msg_101_1")).toBeDefined()
    expect(screen.getByTestId("menu-print-msg_101_1")).toBeDefined()
    expect(screen.getByTestId("menu-copy-email-msg_101_1")).toBeDefined()
  })

  it("opens inline forward composer with CC and BCC controls", () => {
    render(<MailView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))

    const quickForwardBtn = screen.getByTestId("forward-quick-btn-msg_101_1")
    fireEvent.click(quickForwardBtn)

    const inlineComposer = screen.getByTestId("inline-reply-composer")
    expect(inlineComposer).toBeDefined()

    // Toggle CC and BCC
    const ccToggleBtn = screen.getByRole("button", { name: "Cc" })
    fireEvent.click(ccToggleBtn)
    expect(screen.getByTestId("cc-input")).toBeDefined()

    const bccToggleBtn = screen.getByRole("button", { name: "Bcc" })
    fireEvent.click(bccToggleBtn)
    expect(screen.getByTestId("bcc-input")).toBeDefined()
  })

  it("automatically marks active unread conversation as read after viewing", async () => {
    vi.useFakeTimers()
    render(<MailView />, { wrapper: createWrapper() })

    // No conversation selected by default: nothing marked as read initially
    vi.advanceTimersByTime(800)
    expect(mockModifyThreadMutate).not.toHaveBeenCalled()

    // Open unread conversation
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))

    // Advance viewing timer by 800ms
    vi.advanceTimersByTime(800)

    expect(mockModifyThreadMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mth_101",
        req: expect.objectContaining({ isUnread: false }),
      })
    )
    vi.useRealTimers()
  })

  it("renders draft messages as active editable MailComposer rather than read-only cards", () => {
    render(<MailView />, { wrapper: createWrapper() })

    // Click thread containing a draft
    fireEvent.click(screen.getByTestId("thread-row-mth_draft_thread"))

    // Should render active draft composer card rather than standard message card
    expect(screen.getByTestId("draft-composer-card-msg_draft_1")).toBeDefined()
    expect(screen.queryByTestId("message-card-msg_draft_1")).toBeNull()

    // Pre-loaded recipient chip and subject
    expect(screen.getByTestId("to-chip-client@external.com")).toBeDefined()
    const subjectInput = screen.getByTestId(
      "composer-subject-input"
    ) as HTMLInputElement
    expect(subjectInput.value).toBe("Draft Proposal")

    // Send button should be ready
    expect(screen.getByTestId("composer-send-btn")).toBeDefined()
    // Should NOT have read-only Reply/Forward action buttons on draft
    expect(screen.queryByTestId("reply-msg-btn-msg_draft_1")).toBeNull()
  })

  it("renders mail unread badge with unread count from inbox mailboxes", () => {
    render(<MailUnreadBadge />, { wrapper: createWrapper() })
    const badge = screen.getByTestId("mail-unread-badge")
    expect(badge).toBeDefined()
    expect(badge.textContent).toBe("3")
  })

  it("renders draft Cc/Bcc recipients and hydrates draft body when GetThread resolves asynchronously", async () => {
    let hydrated = false
    const stubThread: Thread = {
      ...mockThreads[1],
      messages: [
        {
          ...mockThreads[1].messages[0],
          subject: "",
          to: [],
          cc: [],
          bcc: [],
          bodyHtml: "",
          bodyPlain: "",
          bodyCached: false,
        },
      ],
    }
    const fullThread: Thread = {
      ...mockThreads[1],
      messages: [
        {
          ...mockThreads[1].messages[0],
          cc: [
            {
              name: "Legal Team",
              email: "legal@company.com",
              avatarUrl: "",
              isVerified: false,
            },
          ],
          bcc: [
            {
              name: "Audit",
              email: "audit@company.com",
              avatarUrl: "",
              isVerified: false,
            },
          ],
          bodyHtml: "<p>Hydrated draft body</p>",
        },
      ],
    }

    vi.spyOn(hooks, "useMailThreads").mockReturnValue({
      data: { threads: [stubThread], nextPageToken: "" },
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useMailThreads>)

    vi.spyOn(hooks, "useMailThread").mockImplementation(() => {
      return {
        data: hydrated ? fullThread : stubThread,
        isLoading: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof hooks.useMailThread>
    })

    const { rerender } = render(<MailView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("thread-row-mth_draft_thread"))

    expect(screen.getByTestId("draft-composer-card-msg_draft_1")).toBeDefined()
    expect(screen.queryByTestId("cc-chip-legal@company.com")).toBeNull()

    hydrated = true
    rerender(<MailView />)

    await waitFor(() => {
      expect(screen.getByTestId("cc-chip-legal@company.com")).toBeDefined()
      expect(screen.getByTestId("bcc-chip-audit@company.com")).toBeDefined()
      expect(screen.getByTestId("to-chip-client@external.com")).toBeDefined()
      expect(
        (screen.getByTestId("reply-editor-content") as HTMLIFrameElement)
          .contentDocument?.body.textContent
      ).toContain("Hydrated draft body")
    })
  })

  it("discards a draft when clicking Discard in the draft composer", async () => {
    render(<MailView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("thread-row-mth_draft_thread"))

    const discardBtn = screen.getByTestId("composer-discard-btn")
    fireEvent.click(discardBtn)

    await waitFor(() => {
      expect(mockDeleteDraftMutateAsync).toHaveBeenCalledWith({
        id: "msg_draft_1",
      })
    })
  })
})
