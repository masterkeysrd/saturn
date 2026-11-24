import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  mailKeys,
  useMailThread,
  useInfiniteMailThreads,
  useModifyThread,
  useSummarizeMailThread,
} from "./use-mail"
import * as api from "@saturn/api/saturn/mail/v1/mail"

vi.mock("@saturn/api/saturn/mail/v1/mail", async () => {
  const actual = await vi.importActual<typeof api>(
    "@saturn/api/saturn/mail/v1/mail"
  )
  return {
    ...actual,
    listMailboxes: vi.fn(),
    listThreads: vi.fn(),
    getThread: vi.fn(),
    modifyThread: vi.fn(),
    batchModifyThreads: vi.fn(),
    summarizeThread: vi.fn(),
  }
})

describe("useMail hooks", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
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

  describe("useMailThread", () => {
    it("attaches meta: { persist: false } to prevent sensitive message body caching", () => {
      vi.mocked(api.getThread).mockResolvedValueOnce({
        id: "mth_1",
        spaceId: "sp_1",
        connectedAccountId: "acc_1",
        providerThreadId: "p_1",
        subject: "Confidential",
        snippet: "Secret",
        participants: [],
        messageCount: 1,
        hasAttachments: false,
        isUnread: false,
        isStarred: false,
        inInbox: true,
        inSent: false,
        inDrafts: false,
        inTrash: false,
        inSpam: false,
        mailboxIds: [],
        lastMessageAt: "",
        createTime: "",
        updateTime: "",
        messages: [],
      })

      renderHook(() => useMailThread("mth_1"), {
        wrapper: createWrapper(),
      })

      const queryCache = queryClient.getQueryCache()
      const query = queryCache.find({ queryKey: mailKeys.thread("mth_1") })

      expect(query?.meta).toBeDefined()
      expect(query?.meta?.persist).toBe(false)
    })
  })

  describe("useModifyThread optimistic archive and rollback", () => {
    it("optimistically removes thread from INBOX cache and rolls back on failure", async () => {
      const inboxQueryKey = mailKeys.threads({
        systemBucket: "MAILBOX_ROLE_INBOX",
      })

      const initialInboxData: api.ListThreadsResponse = {
        threads: [
          {
            id: "mth_to_archive",
            spaceId: "sp_1",
            connectedAccountId: "acc_1",
            providerThreadId: "p_1",
            subject: "Quarterly Review",
            snippet: "See attached",
            participants: [],
            messageCount: 1,
            hasAttachments: false,
            isUnread: true,
            isStarred: false,
            inInbox: true,
            inSent: false,
            inDrafts: false,
            inTrash: false,
            inSpam: false,
            mailboxIds: ["mbx_inbox_1"],
            lastMessageAt: "",
            createTime: "",
            updateTime: "",
            messages: [],
          },
          {
            id: "mth_staying",
            spaceId: "sp_1",
            connectedAccountId: "acc_1",
            providerThreadId: "p_2",
            subject: "Keep this",
            snippet: "Hello",
            participants: [],
            messageCount: 1,
            hasAttachments: false,
            isUnread: false,
            isStarred: false,
            inInbox: true,
            inSent: false,
            inDrafts: false,
            inTrash: false,
            inSpam: false,
            mailboxIds: ["mbx_inbox_1"],
            lastMessageAt: "",
            createTime: "",
            updateTime: "",
            messages: [],
          },
        ],
        nextPageToken: "",
        totalSize: 2,
      }

      queryClient.setQueryData(inboxQueryKey, initialInboxData)

      let rejectPromise!: (err: Error) => void
      vi.mocked(api.modifyThread).mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectPromise = reject
          })
      )

      const { result } = renderHook(() => useModifyThread(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.mutate({
          id: "mth_to_archive",
          req: { id: "mth_to_archive", inInbox: false },
        })
      })

      // Immediately removed from INBOX cache
      await waitFor(() => {
        const cached =
          queryClient.getQueryData<api.ListThreadsResponse>(inboxQueryKey)
        expect(cached?.threads).toHaveLength(1)
        expect(cached?.threads[0].id).toBe("mth_staying")
      })

      // Trigger failure
      act(() => {
        rejectPromise(new Error("Network error during archive"))
      })

      // Rolls back to initial 2 threads
      await waitFor(() => {
        const rolledBack =
          queryClient.getQueryData<api.ListThreadsResponse>(inboxQueryKey)
        expect(rolledBack?.threads).toHaveLength(2)
        expect(rolledBack?.threads.map((t) => t.id)).toContain("mth_to_archive")
      })
    })
  })

  describe("useSummarizeMailThread", () => {
    it("calls summarizeThread and hydrates mailKeys.thread cache with fresh summary", async () => {
      const threadQueryKey = mailKeys.thread("mth_1")
      queryClient.setQueryData<api.Thread>(threadQueryKey, {
        id: "mth_1",
        spaceId: "sp_1",
        connectedAccountId: "acc_1",
        providerThreadId: "p_1",
        subject: "Quarterly Review",
        snippet: "See attached",
        participants: [],
        messageCount: 3,
        hasAttachments: false,
        isUnread: false,
        isStarred: false,
        inInbox: true,
        inSent: false,
        inDrafts: false,
        inTrash: false,
        inSpam: false,
        mailboxIds: [],
        lastMessageAt: "",
        createTime: "",
        updateTime: "",
        messages: [],
        summary: {
          threadId: "mth_1",
          language: "en",
          tldr: "Stale summary",
          keyPoints: [],
          actionItems: [],
          lastMessageId: "msg_old",
          lastMessageAt: "",
          messageCount: 1,
          isStale: true,
          flowRunId: "",
          updateTime: "",
        },
      })

      const freshSummary: api.ThreadSummary = {
        threadId: "mth_1",
        language: "en",
        tldr: "Fresh summary",
        keyPoints: ["Ship by Friday"],
        actionItems: ["Confirm dates"],
        lastMessageId: "msg_new",
        lastMessageAt: "",
        messageCount: 3,
        isStale: true,
        flowRunId: "flow_1",
        updateTime: "",
      }
      vi.mocked(api.summarizeThread).mockResolvedValueOnce(freshSummary)

      const { result } = renderHook(() => useSummarizeMailThread(), {
        wrapper: createWrapper(),
      })

      act(() => {
        result.current.mutate({
          id: "mth_1",
          forceRegenerate: true,
          language: "en",
        })
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(vi.mocked(api.summarizeThread)).toHaveBeenCalledWith("mth_1", {
        id: "mth_1",
        forceRegenerate: true,
        language: "en",
      })

      const cached = queryClient.getQueryData<api.Thread>(threadQueryKey)
      expect(cached?.summary?.tldr).toBe("Fresh summary")
      expect(cached?.summary?.isStale).toBe(false)
      expect(cached?.summary?.keyPoints).toEqual(["Ship by Friday"])
    })
  })

  describe("useInfiniteMailThreads", () => {
    it("fetches subsequent pages using nextPageToken", async () => {
      vi.mocked(api.listThreads)
        .mockResolvedValueOnce({
          threads: [
            {
              id: "mth_page_1",
              spaceId: "sp_1",
              connectedAccountId: "acc_1",
              providerThreadId: "p_1",
              subject: "Page 1",
              snippet: "",
              participants: [],
              messageCount: 1,
              hasAttachments: false,
              isUnread: false,
              isStarred: false,
              inInbox: true,
              inSent: false,
              inDrafts: false,
              inTrash: false,
              inSpam: false,
              mailboxIds: [],
              lastMessageAt: "",
              createTime: "",
              updateTime: "",
              messages: [],
            },
          ],
          nextPageToken: "50",
          totalSize: 2,
        })
        .mockResolvedValueOnce({
          threads: [
            {
              id: "mth_page_2",
              spaceId: "sp_1",
              connectedAccountId: "acc_1",
              providerThreadId: "p_2",
              subject: "Page 2",
              snippet: "",
              participants: [],
              messageCount: 1,
              hasAttachments: false,
              isUnread: false,
              isStarred: false,
              inInbox: true,
              inSent: false,
              inDrafts: false,
              inTrash: false,
              inSpam: false,
              mailboxIds: [],
              lastMessageAt: "",
              createTime: "",
              updateTime: "",
              messages: [],
            },
          ],
          nextPageToken: "",
          totalSize: 2,
        })

      const { result } = renderHook(
        () => useInfiniteMailThreads({ pageSize: 50 }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.data?.pages).toHaveLength(1)
      })
      expect(result.current.hasNextPage).toBe(true)

      await act(async () => {
        await result.current.fetchNextPage()
      })

      await waitFor(() => {
        expect(result.current.data?.pages).toHaveLength(2)
      })
      expect(vi.mocked(api.listThreads)).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ pageToken: "50", pageSize: 50 })
      )
      expect(result.current.hasNextPage).toBe(false)
    })
  })
})
