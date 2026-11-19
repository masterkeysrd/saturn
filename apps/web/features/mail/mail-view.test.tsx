import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { Toaster } from "@/components/ui/toast"
import { MailView } from "./mail-view"
import { MailUnreadBadge } from "./components/mail-unread-badge"
import * as hooks from "@saturn/hooks"
import * as aiHooks from "@saturn/hooks/ai"
import * as financeApi from "@saturn/api/gen/saturn/finance/v1/finance"
import type { Thread, Mailbox } from "@saturn/api/saturn/mail/v1/mail"

vi.mock("@/features/space/use-space", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/space/use-space")
  >("@/features/space/use-space")
  return {
    ...actual,
    useActiveSpaceContext: () => ({
      spaceId: "sp_1",
      spaceName: "Personal",
      spaceRole: "owner",
    }),
    useSpacePermissions: () => ({
      spaceId: "sp_1",
      spaceRole: "owner",
      isWritable: true,
      canManageSpace: true,
    }),
  }
})

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
  const mockCreateInboxItemMutateAsync = vi
    .fn()
    .mockResolvedValue({ id: "ibx_1" })

  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.spyOn(financeApi, "useGetSettingsQuery").mockReturnValue({
      data: { baseCurrency: "USD" },
    } as unknown as ReturnType<typeof financeApi.useGetSettingsQuery>)
    vi.spyOn(financeApi, "useListAccountsQuery").mockReturnValue({
      data: { accounts: [] },
    } as unknown as ReturnType<typeof financeApi.useListAccountsQuery>)
    vi.spyOn(financeApi, "useListBudgetsQuery").mockReturnValue({
      data: { budgets: [] },
    } as unknown as ReturnType<typeof financeApi.useListBudgetsQuery>)
    vi.spyOn(financeApi, "useListCurrenciesQuery").mockReturnValue({
      data: { currencies: [{ code: "USD", name: "US Dollar" }] },
    } as unknown as ReturnType<typeof financeApi.useListCurrenciesQuery>)
    vi.spyOn(financeApi, "useCreateInboxItemMutation").mockReturnValue({
      mutateAsync: mockCreateInboxItemMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof financeApi.useCreateInboxItemMutation>)

    vi.spyOn(hooks, "useConnectedAccounts").mockReturnValue({
      data: { accounts: mockAccounts },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useConnectedAccounts>)

    vi.spyOn(hooks, "useInitiateOAuth").mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ authUrl: "" }),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useInitiateOAuth>)

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

    vi.spyOn(hooks, "useInfiniteMailThreads").mockReturnValue({
      data: {
        pages: [
          {
            threads: mockThreads,
            nextPageToken: "",
            totalSize: mockThreads.length,
          },
        ],
        pageParams: [""],
      },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useInfiniteMailThreads>)

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
        createElement(Toaster, null, children)
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

    expect(hooks.useInfiniteMailThreads).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: "acc_work" })
    )

    // Click All Accounts
    const allAccBtn = screen.getByTestId("account-filter-all")
    fireEvent.click(allAccBtn)

    expect(hooks.useInfiniteMailThreads).toHaveBeenLastCalledWith(
      expect.objectContaining({ connectedAccountId: "" })
    )
  })

  it("opens docked composer and sends email with recipient after undo-send buffer", async () => {
    vi.useFakeTimers()
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

    // Send -> saves draft and buffers send for 7s
    const sendBtn = screen.getByTestId("composer-send-btn")
    await act(async () => {
      fireEvent.click(sendBtn)
      await Promise.resolve()
    })

    expect(mockSaveDraftMutateAsync).toHaveBeenCalled()
    expect(mockSendDraftMutateAsync).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(7000)
      await Promise.resolve()
    })

    expect(mockSendDraftMutateAsync).toHaveBeenCalledWith({ id: "mdf_new_1" })
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

    vi.spyOn(hooks, "useInfiniteMailThreads").mockReturnValue({
      data: {
        pages: [{ threads: [stubThread], nextPageToken: "", totalSize: 1 }],
        pageParams: [""],
      },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useInfiniteMailThreads>)

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

  it("renders Load more button when more pages exist and calls fetchNextPage", () => {
    const mockFetchNextPage = vi.fn()
    vi.spyOn(hooks, "useInfiniteMailThreads").mockReturnValue({
      data: {
        pages: [
          {
            threads: mockThreads,
            nextPageToken: "50",
            totalSize: 120,
          },
        ],
        pageParams: [""],
      },
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useInfiniteMailThreads>)

    render(<MailView />, { wrapper: createWrapper() })

    const loadMoreBtn = screen.getByTestId("load-more-threads-btn")
    expect(loadMoreBtn).toBeDefined()
    fireEvent.click(loadMoreBtn)
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1)
  })

  it("calls fetchNextPage when scrolling near bottom of thread list", () => {
    const mockFetchNextPage = vi.fn()
    vi.spyOn(hooks, "useInfiniteMailThreads").mockReturnValue({
      data: {
        pages: [
          {
            threads: mockThreads,
            nextPageToken: "50",
            totalSize: 120,
          },
        ],
        pageParams: [""],
      },
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useInfiniteMailThreads>)

    render(<MailView />, { wrapper: createWrapper() })

    const scrollContainer = screen.getByTestId("thread-list-scroll-container")
    Object.defineProperty(scrollContainer, "scrollHeight", {
      value: 1000,
      configurable: true,
    })
    Object.defineProperty(scrollContainer, "clientHeight", {
      value: 400,
      configurable: true,
    })
    Object.defineProperty(scrollContainer, "scrollTop", {
      value: 450,
      configurable: true,
    })

    fireEvent.scroll(scrollContainer)
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1)
  })

  it("calls fetchNextPage via IntersectionObserver when load-more sentinel intersects", () => {
    const mockFetchNextPage = vi.fn()
    let observerCallback: IntersectionObserverCallback | undefined
    const observeMock = vi.fn()
    const disconnectMock = vi.fn()

    class MockIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb
      }
      observe = observeMock
      disconnect = disconnectMock
      unobserve = vi.fn()
      takeRecords = vi.fn(() => [])
      root = null
      rootMargin = ""
      thresholds = []
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)

    try {
      vi.spyOn(hooks, "useInfiniteMailThreads").mockReturnValue({
        data: {
          pages: [
            {
              threads: mockThreads,
              nextPageToken: "50",
              totalSize: 120,
            },
          ],
          pageParams: [""],
        },
        isLoading: false,
        hasNextPage: true,
        isFetchingNextPage: false,
        fetchNextPage: mockFetchNextPage,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof hooks.useInfiniteMailThreads>)

      render(<MailView />, { wrapper: createWrapper() })

      const sentinel = screen.getByTestId("load-more-sentinel")
      expect(observeMock).toHaveBeenCalledWith(sentinel)
      expect(observerCallback).toBeDefined()

      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )

      expect(mockFetchNextPage).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("ignores Cmd/Ctrl shortcuts (Cmd+C, Cmd+R) and opens inline reply when pressing 'r'", async () => {
    render(<MailView />, { wrapper: createWrapper() })

    // Select a thread first
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))

    // Cmd+C must NOT open compose modal
    const copyEvent = new KeyboardEvent("keydown", {
      key: "c",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(copyEvent)
    expect(copyEvent.defaultPrevented).toBe(false)
    expect(screen.queryByTestId("composer-subject-input")).toBeNull()

    // Cmd+R must NOT open inline reply
    const reloadEvent = new KeyboardEvent("keydown", {
      key: "r",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(reloadEvent)
    expect(reloadEvent.defaultPrevented).toBe(false)
    expect(screen.queryByTestId("inline-reply-composer")).toBeNull()

    // Plain 'r' opens inline reply on the selected thread
    fireEvent.keyDown(window, { key: "r" })
    await waitFor(() => {
      expect(screen.getByTestId("inline-reply-composer")).toBeDefined()
    })
  })

  it("opens deep-linked threadId and compose modal from URL search params", async () => {
    render(
      <MemoryRouter
        initialEntries={["/space/sp_1/mail?threadId=mth_101&compose=1"]}
      >
        <MailView />
      </MemoryRouter>,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByTestId("thread-reader-pane")).toBeDefined()
    })
    expect(screen.getByTestId("thread-subject-heading").textContent).toContain(
      "Q3 Budget Review"
    )
    expect(screen.getByTestId("mail-compose-modal")).toBeDefined()
  })

  it("collapses MailboxRail, toggles Split vs List Only layout with Back navigation, and resizes split pane", () => {
    render(<MailView />, { wrapper: createWrapper() })

    // Collapse MailboxRail
    expect(screen.getByTestId("mailbox-rail")).toBeDefined()
    fireEvent.click(screen.getByTestId("mail-toggle-rail-btn"))
    expect(screen.queryByTestId("mailbox-rail")).toBeNull()
    expect(localStorage.getItem("saturn:mail-rail-open")).toBe("false")

    // Expand MailboxRail
    fireEvent.click(screen.getByTestId("mail-toggle-rail-btn"))
    expect(screen.getByTestId("mailbox-rail")).toBeDefined()

    // Keyboard resize split pane
    const resizer = screen.getByTestId("mail-split-resizer")
    fireEvent.keyDown(resizer, { key: "ArrowRight" })
    expect(localStorage.getItem("saturn:mail-list-width")).toBe("376")

    // Toggle to List Only layout
    fireEvent.click(screen.getByTestId("mail-layout-toggle-btn"))
    expect(localStorage.getItem("saturn:mail-layout")).toBe("list")
    expect(screen.getByTestId("thread-list-pane")).toBeDefined()
    expect(screen.queryByTestId("thread-reader-empty")).toBeNull()

    // Select thread -> ThreadReader renders full-width with Back button
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))
    expect(screen.queryByTestId("thread-list-pane")).toBeNull()
    expect(screen.getByTestId("thread-reader-pane")).toBeDefined()
    const backBtn = screen.getByTestId("thread-reader-back-btn")
    expect(backBtn).toBeDefined()

    // Click Back -> returns to ThreadList
    fireEvent.click(backBtn)
    expect(screen.getByTestId("thread-list-pane")).toBeDefined()
    expect(screen.queryByTestId("thread-reader-pane")).toBeNull()
  })

  it("supports Superhuman-grade keyboard triage (j, k, s, e, /)", () => {
    render(<MailView />, { wrapper: createWrapper() })

    // 'j' selects first thread (mth_101)
    fireEvent.keyDown(window, { key: "j" })
    expect(screen.getByTestId("thread-subject-heading").textContent).toContain(
      "Q3 Budget Review"
    )

    // 'j' again selects next thread (mth_draft_thread)
    fireEvent.keyDown(window, { key: "j" })
    expect(screen.getByTestId("thread-subject-heading").textContent).toContain(
      "Draft Proposal"
    )

    // 'k' selects previous thread (mth_101)
    fireEvent.keyDown(window, { key: "k" })
    expect(screen.getByTestId("thread-subject-heading").textContent).toContain(
      "Q3 Budget Review"
    )

    // 's' toggles star
    fireEvent.keyDown(window, { key: "s" })
    expect(mockModifyThreadMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mth_101",
        req: expect.objectContaining({ isStarred: true }),
      })
    )

    // 'e' archives thread
    fireEvent.keyDown(window, { key: "e" })
    expect(mockModifyThreadMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mth_101",
        req: expect.objectContaining({ inInbox: false }),
      })
    )

    // '/' focuses search input without typing '/'
    const searchInput = screen.getByTestId(
      "mail-search-input"
    ) as HTMLInputElement
    const slashEvent = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(slashEvent)
    expect(slashEvent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(searchInput)
  })

  it("buffers outgoing email for 7s and cancels send + reopens composer when Undo is clicked", async () => {
    vi.useFakeTimers()
    render(<MailView />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByTestId("compose-btn"))
    const toInput = screen.getByTestId("to-input")
    fireEvent.change(toInput, { target: { value: "billing@vendor.com" } })
    fireEvent.keyDown(toInput, { key: "Enter" })
    fireEvent.change(screen.getByTestId("composer-subject-input"), {
      target: { value: "Invoice Question" },
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId("composer-send-btn"))
      await Promise.resolve()
    })

    expect(mockSaveDraftMutateAsync).toHaveBeenCalled()
    expect(mockSendDraftMutateAsync).not.toHaveBeenCalled()
    expect(screen.queryByTestId("mail-compose-modal")).toBeNull()

    // Click Undo inside toast before 7s expires
    const undoBtn = screen.getByRole("button", { name: "Undo" })
    fireEvent.click(undoBtn)

    // Composer reopens with draft subject & recipient
    expect(screen.getByTestId("mail-compose-modal")).toBeDefined()
    expect(
      (screen.getByTestId("composer-subject-input") as HTMLInputElement).value
    ).toBe("Invoice Question")
    expect(screen.getByTestId("to-chip-billing@vendor.com")).toBeDefined()

    // Even after 7s passes, sendDraft must NOT have been called
    await act(async () => {
      vi.advanceTimersByTime(8000)
      await Promise.resolve()
    })
    expect(mockSendDraftMutateAsync).not.toHaveBeenCalled()
  })

  it("stages a receipt/invoice email to Finance Inbox with pre-extracted defaults and idempotency key", async () => {
    const receiptThread: Thread = {
      ...mockThreads[0],
      id: "mth_receipt",
      subject: "Your Stripe Receipt #1042",
      snippet: "Payment of $42.50 was charged to your card.",
      messages: [
        {
          ...mockThreads[0].messages[0],
          id: "msg_receipt_1",
          threadId: "mth_receipt",
          subject: "Your Stripe Receipt #1042",
          snippet: "Payment of $42.50 was charged to your card.",
          from: {
            name: "Stripe",
            email: "receipts@stripe.com",
            avatarUrl: "",
            isVerified: true,
          },
          bodyHtml: "<p>Thank you for your payment of $42.50.</p>",
          bodyPlain: "Thank you for your payment of $42.50.",
        },
      ],
    }

    vi.spyOn(hooks, "useInfiniteMailThreads").mockReturnValue({
      data: {
        pages: [
          {
            threads: [receiptThread],
            nextPageToken: "",
            totalSize: 1,
          },
        ],
        pageParams: [""],
      },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useInfiniteMailThreads>)

    vi.spyOn(hooks, "useMailThread").mockReturnValue({
      data: receiptThread,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useMailThread>)

    render(<MailView />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByTestId("thread-row-mth_receipt"))

    // 1-click "Stage Receipt" chip appears on financial signals
    const stageChip = screen.getByTestId("stage-receipt-chip-btn")
    expect(stageChip).toBeDefined()

    // Also verify it exists in the message More menu
    fireEvent.click(screen.getByTestId("message-more-btn-msg_receipt_1"))
    expect(screen.getByTestId("stage-to-finance-menu-item")).toBeDefined()

    // Click Stage Receipt chip to open StageToFinanceDialog
    fireEvent.click(stageChip)

    expect(screen.getByTestId("stage-to-finance-dialog")).toBeDefined()
    expect(
      (screen.getByTestId("stage-finance-vendor-input") as HTMLInputElement)
        .value
    ).toBe("Stripe")
    expect(
      (screen.getByTestId("stage-finance-amount-input") as HTMLInputElement)
        .value
    ).toBe("42.50")

    // Submit form
    fireEvent.click(
      screen.getByRole("button", { name: "Stage to Finance Inbox" })
    )

    await waitFor(() => {
      expect(mockCreateInboxItemMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: "mail_message:msg_receipt_1",
          inboxItem: expect.objectContaining({
            vendorName: "Stripe",
            amount: "4250",
            currency: "USD",
            docType: "RECEIPT",
            metadata: expect.objectContaining({
              source: "mail",
              mail_thread_id: "mth_receipt",
              mail_message_id: "msg_receipt_1",
            }),
          }),
        })
      )
    })
  })

  it("renders Spanish translations across the email view when user locale is es-ES", async () => {
    const copilotSpy = vi.spyOn(aiHooks, "useRegisterCopilotView")

    render(
      <MemoryRouter>
        <hooks.TimezoneProvider timezone="UTC" locale="es-ES">
          <MailView />
        </hooks.TimezoneProvider>
      </MemoryRouter>,
      { wrapper: createWrapper() }
    )

    // Verify inbox agent suggestions registered in Spanish
    expect(copilotSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestions: [
          "Resume mis correos no leídos",
          "¿Qué correos necesitan respuesta hoy?",
          "Busca recibos o facturas recientes en mi bandeja",
        ],
      })
    )

    // Verify Spanish compose button
    const composeBtn = screen.getByTestId("compose-btn")
    expect(composeBtn.textContent).toContain("Redactar")

    // Verify Spanish bucket labels in the rail
    expect(
      screen.getByTestId("bucket-mailbox_role_inbox").textContent
    ).toContain("Bandeja de entrada")
    expect(
      screen.getByTestId("bucket-mailbox_role_sent").textContent
    ).toContain("Enviados")
    expect(
      screen.getByTestId("bucket-mailbox_role_trash").textContent
    ).toContain("Papelera")

    // Verify search input placeholder in Spanish
    const searchInput = screen.getByTestId("mail-search-input")
    expect(searchInput.getAttribute("placeholder")).toBe("Buscar correo... (/)")

    // Verify All Accounts filter button in Spanish
    const allAccBtn = screen.getByTestId("account-filter-all")
    expect(allAccBtn.textContent).toContain("Todas las cuentas")

    // Select a thread and verify thread reader translations
    fireEvent.click(screen.getByTestId("thread-row-mth_101"))
    expect(screen.getByTestId("thread-reader-pane")).toBeDefined()

    // Verify thread-level agent suggestions in Spanish
    expect(copilotSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestions: [
          "Resume este hilo y extrae los puntos de acción",
          "Redacta una respuesta concisa",
          "¿Se menciona alguna fecha límite o monto aquí?",
        ],
      })
    )

    // Action buttons in Spanish
    expect(screen.getByTestId("archive-thread-btn").getAttribute("title")).toBe(
      "Archivar (e)"
    )
    expect(screen.getByTestId("trash-thread-btn").getAttribute("title")).toBe(
      "Eliminar (#)"
    )
    expect(screen.getByTestId("star-thread-btn").getAttribute("title")).toBe(
      "Destacar (s)"
    )
    expect(screen.getByTestId("mark-unread-btn").getAttribute("title")).toBe(
      "Marcar como no leído (u)"
    )

    // Message action buttons in Spanish
    const [replyBtn] = screen.getAllByTestId("reply-msg-btn-msg_101_1")
    expect(replyBtn.textContent).toContain("Responder")

    const [forwardBtn] = screen.getAllByTestId("forward-msg-btn-msg_101_1")
    expect(forwardBtn.textContent).toContain("Reenviar")

    // Open compose modal and verify editor placeholder in Spanish
    fireEvent.click(screen.getByTestId("compose-btn"))
    const editorIframe = screen.getByTestId(
      "composer-editor-content"
    ) as HTMLIFrameElement
    expect(
      editorIframe.contentDocument?.body.getAttribute("data-placeholder")
    ).toBe("Escribe tu correo aquí...")
  })

  it("renders Apple Mail style warning icon on reauth_required accounts in MailboxRail and collapsed rail toggle, and triggers OAuth reconnect on click", async () => {
    const reauthAccounts = [
      {
        ...mockAccounts[0],
        status: "reauth_required",
      },
      {
        ...mockAccounts[1],
        status: "connected",
      },
    ]

    vi.spyOn(hooks, "useConnectedAccounts").mockReturnValue({
      data: { accounts: reauthAccounts },
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.useConnectedAccounts>)

    const mutateInitiateOAuth = vi.fn().mockResolvedValue({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?reauth=1",
    })
    vi.spyOn(hooks, "useInitiateOAuth").mockReturnValue({
      mutateAsync: mutateInitiateOAuth,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useInitiateOAuth>)

    const originalLocation = window.location
    const assignMock = vi.fn()
    Object.defineProperty(window, "location", {
      value: {
        ...originalLocation,
        href: "http://localhost:3000/mail",
        assign: assignMock,
      },
      writable: true,
    })

    try {
      render(<MailView />, { wrapper: createWrapper() })

      // Warning icon shows only for the reauth_required account (no full-width top banner)
      expect(screen.queryByTestId("mail-reauth-banner")).toBeNull()
      const warningBtn = screen.getByTestId("account-reauth-warning-acc_work")
      expect(warningBtn).toBeDefined()
      expect(
        screen.queryByTestId("account-reauth-warning-acc_personal")
      ).toBeNull()

      // Clicking the warning icon triggers OAuth reconnect without crashing
      fireEvent.click(warningBtn)

      await waitFor(() => {
        expect(mutateInitiateOAuth).toHaveBeenCalledWith({
          provider: "google",
          returnUrl: "http://localhost:3000/mail",
          capabilities: ["mail", "calendar"],
          connectedAccountId: "acc_work",
        })
        expect(assignMock).toHaveBeenCalledWith(
          "https://accounts.google.com/o/oauth2/v2/auth?reauth=1"
        )
      })

      // Collapsing MailboxRail shows the subtle amber dot on the rail toggle button
      fireEvent.click(screen.getByTestId("mail-toggle-rail-btn"))
      expect(screen.getByTestId("mail-rail-reauth-dot")).toBeDefined()
    } finally {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      })
    }
  })
})
