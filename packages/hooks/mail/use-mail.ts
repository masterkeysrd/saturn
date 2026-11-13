import {
  useQuery,
  type UseQueryOptions,
  useMutation,
  type UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query"
import {
  listMailboxes,
  getThread,
  listThreads,
  modifyThread,
  batchModifyThreads,
  type Mailbox,
  type Thread,
  type Message,
  type ListMailboxesRequest,
  type ListMailboxesResponse,
  type ListThreadsRequest,
  type ListThreadsResponse,
  type GetThreadRequest,
  type ModifyThreadRequest,
  type BatchModifyThreadsRequest,
  type MailboxRole,
} from "@saturn/api/saturn/mail/v1/mail"

export type {
  Mailbox,
  Thread,
  Message,
  ListMailboxesRequest,
  ListMailboxesResponse,
  ListThreadsRequest,
  ListThreadsResponse,
  GetThreadRequest,
  ModifyThreadRequest,
  BatchModifyThreadsRequest,
  MailboxRole,
}

export type ListThreadsFilter = Partial<ListThreadsRequest>

export const mailKeys = {
  all: () => ["mail"] as const,
  mailboxes: (connectedAccountId?: string) =>
    ["mail", "mailboxes", { connectedAccountId }] as const,
  threads: (filter?: ListThreadsFilter) => ["mail", "threads", filter] as const,
  allThreads: () => ["mail", "threads"] as const,
  thread: (id: string) => ["mail", "thread", id] as const,
}

const isTestEnv =
  typeof globalThis !== "undefined" &&
  (
    globalThis as unknown as {
      process?: { env?: { NODE_ENV?: string } }
    }
  ).process?.env?.NODE_ENV === "test"

export function useMailboxes(
  connectedAccountId?: string,
  options?: Omit<
    UseQueryOptions<ListMailboxesResponse, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery<ListMailboxesResponse, Error>({
    queryKey: mailKeys.mailboxes(connectedAccountId),
    queryFn: () =>
      listMailboxes({
        connectedAccountId: connectedAccountId || "",
        systemRole: "MAILBOX_ROLE_UNSPECIFIED",
      }),
    refetchInterval:
      options?.refetchInterval !== undefined
        ? options.refetchInterval
        : isTestEnv
          ? false
          : 60_000,
    refetchOnWindowFocus: true,
    ...options,
  })
}

export function useMailThreads(
  filter: ListThreadsFilter = {},
  options?: Omit<
    UseQueryOptions<ListThreadsResponse, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery<ListThreadsResponse, Error>({
    queryKey: mailKeys.threads(filter),
    queryFn: () =>
      listThreads({
        connectedAccountId: filter.connectedAccountId || "",
        mailboxId: filter.mailboxId || "",
        systemBucket:
          filter.systemBucket ?? ("MAILBOX_ROLE_UNSPECIFIED" as MailboxRole),
        isUnread: filter.isUnread,
        isStarred: filter.isStarred,
        query: filter.query || "",
        pageSize: filter.pageSize || 50,
        pageToken: filter.pageToken || "",
      }),
    refetchInterval:
      options?.refetchInterval !== undefined
        ? options.refetchInterval
        : isTestEnv
          ? false
          : 60_000,
    refetchOnWindowFocus: true,
    ...options,
  })
}

export function useMailThread(
  threadId?: string,
  options?: Omit<UseQueryOptions<Thread, Error>, "queryKey" | "queryFn">
) {
  return useQuery<Thread, Error>({
    queryKey: mailKeys.thread(threadId || ""),
    queryFn: () => {
      if (!threadId) throw new Error("Thread ID is required")
      return getThread(threadId, { id: threadId })
    },
    enabled:
      Boolean(threadId) &&
      (options?.enabled !== undefined ? options.enabled : true),
    meta: {
      persist: false,
      ...options?.meta,
    },
    ...options,
  })
}

export interface ModifyThreadVariables {
  id: string
  req: ModifyThreadRequest
}

export function useModifyThread(
  options?: UseMutationOptions<
    Thread,
    Error,
    ModifyThreadVariables,
    {
      previousQueries?: Array<
        [readonly unknown[], ListThreadsResponse | undefined]
      >
    }
  >
) {
  const queryClient = useQueryClient()

  return useMutation<
    Thread,
    Error,
    ModifyThreadVariables,
    {
      previousQueries?: Array<
        [readonly unknown[], ListThreadsResponse | undefined]
      >
    }
  >({
    mutationFn: ({ id, req }) => modifyThread(id, req),
    onMutate: async ({ id, req }) => {
      await queryClient.cancelQueries({ queryKey: mailKeys.allThreads() })

      const matchingQueries = queryClient.getQueriesData<ListThreadsResponse>({
        queryKey: mailKeys.allThreads(),
      })
      const previousQueries: Array<
        [readonly unknown[], ListThreadsResponse | undefined]
      > = matchingQueries.map(([key, data]) => [key, data])

      const isArchiving =
        req.inInbox === false ||
        Boolean(
          req.removeMailboxIds &&
          req.removeMailboxIds.some((mid) =>
            mid.toLowerCase().includes("inbox")
          )
        )

      for (const [key, data] of matchingQueries) {
        if (!data) continue

        // Check query filter to see if it's viewing INBOX
        const filter = (key[2] || {}) as ListThreadsFilter
        const isInboxView =
          filter.systemBucket === "MAILBOX_ROLE_INBOX" ||
          (!filter.systemBucket && !filter.mailboxId && !filter.query)

        let updatedThreads = data.threads.map((t) => {
          if (t.id === id) {
            const updated = { ...t }
            if (req.isUnread !== undefined) {
              updated.isUnread = req.isUnread
            }
            if (req.isStarred !== undefined) {
              updated.isStarred = req.isStarred
            }
            if (req.inInbox !== undefined) {
              updated.inInbox = req.inInbox
            }
            if (isArchiving) {
              updated.inInbox = false
            }
            if (req.inTrash !== undefined) {
              updated.inTrash = req.inTrash
              if (req.inTrash) {
                updated.inInbox = false
              }
            }
            if (req.inSpam !== undefined) {
              updated.inSpam = req.inSpam
              if (req.inSpam) {
                updated.inInbox = false
              }
            }
            return updated
          }
          return t
        })

        const isTrashView = filter.systemBucket === "MAILBOX_ROLE_TRASH"

        // If thread is trashed, immediately remove it from all non-trash views
        if (req.inTrash && !isTrashView) {
          updatedThreads = updatedThreads.filter((t) => t.id !== id)
        } else if (isInboxView && (isArchiving || req.inSpam)) {
          // If viewing inbox and thread is archived or spammed, filter it out immediately
          updatedThreads = updatedThreads.filter((t) => t.id !== id)
        }

        queryClient.setQueryData<ListThreadsResponse>(key, {
          ...data,
          threads: updatedThreads,
        })
      }

      return { previousQueries }
    },
    onError: (err, variables, context, mutation) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data)
        }
      }
      options?.onError?.(err, variables, context, mutation)
    },
    onSettled: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: mailKeys.all() })
      if (options?.onSettled) {
        options.onSettled(...args)
      }
    },
    ...options,
  })
}

export function useBatchModifyThreads(
  options?: UseMutationOptions<
    Record<string, never>,
    Error,
    BatchModifyThreadsRequest,
    {
      previousQueries?: Array<
        [readonly unknown[], ListThreadsResponse | undefined]
      >
    }
  >
) {
  const queryClient = useQueryClient()

  return useMutation<
    Record<string, never>,
    Error,
    BatchModifyThreadsRequest,
    {
      previousQueries?: Array<
        [readonly unknown[], ListThreadsResponse | undefined]
      >
    }
  >({
    mutationFn: (req) => batchModifyThreads(req),
    onMutate: async (req) => {
      await queryClient.cancelQueries({ queryKey: mailKeys.allThreads() })

      const matchingQueries = queryClient.getQueriesData<ListThreadsResponse>({
        queryKey: mailKeys.allThreads(),
      })
      const previousQueries: Array<
        [readonly unknown[], ListThreadsResponse | undefined]
      > = matchingQueries.map(([key, data]) => [key, data])

      const threadIdsSet = new Set(req.ids || [])
      const isArchiving =
        req.inInbox === false ||
        Boolean(
          req.removeMailboxIds &&
          req.removeMailboxIds.some((mid) =>
            mid.toLowerCase().includes("inbox")
          )
        )

      for (const [key, data] of matchingQueries) {
        if (!data) continue

        const filter = (key[2] || {}) as ListThreadsFilter
        const isInboxView =
          filter.systemBucket === "MAILBOX_ROLE_INBOX" ||
          (!filter.systemBucket && !filter.mailboxId && !filter.query)

        let updatedThreads = data.threads.map((t) => {
          if (threadIdsSet.has(t.id)) {
            const updated = { ...t }
            if (req.isUnread !== undefined) {
              updated.isUnread = req.isUnread
            }
            if (req.isStarred !== undefined) {
              updated.isStarred = req.isStarred
            }
            if (req.inInbox !== undefined) {
              updated.inInbox = req.inInbox
            }
            if (isArchiving) {
              updated.inInbox = false
            }
            if (req.inTrash !== undefined) {
              updated.inTrash = req.inTrash
              if (req.inTrash) {
                updated.inInbox = false
              }
            }
            if (req.inSpam !== undefined) {
              updated.inSpam = req.inSpam
              if (req.inSpam) {
                updated.inInbox = false
              }
            }
            return updated
          }
          return t
        })

        const isTrashView = filter.systemBucket === "MAILBOX_ROLE_TRASH"

        if (req.inTrash && !isTrashView) {
          updatedThreads = updatedThreads.filter((t) => !threadIdsSet.has(t.id))
        } else if (isInboxView && (isArchiving || req.inSpam)) {
          updatedThreads = updatedThreads.filter((t) => !threadIdsSet.has(t.id))
        }

        queryClient.setQueryData<ListThreadsResponse>(key, {
          ...data,
          threads: updatedThreads,
        })
      }

      return { previousQueries }
    },
    onError: (err, variables, context, mutation) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data)
        }
      }
      options?.onError?.(err, variables, context, mutation)
    },
    onSettled: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: mailKeys.all() })
      if (options?.onSettled) {
        options.onSettled(...args)
      }
    },
    ...options,
  })
}
