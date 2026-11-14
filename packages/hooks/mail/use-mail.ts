import {
  useQuery,
  type UseQueryOptions,
  useInfiniteQuery,
  type InfiniteData,
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
  infiniteThreads: (filter?: ListThreadsFilter) =>
    ["mail", "threads", filter, "infinite"] as const,
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

export function useInfiniteMailThreads(filter: ListThreadsFilter = {}) {
  return useInfiniteQuery<
    ListThreadsResponse,
    Error,
    InfiniteData<ListThreadsResponse>,
    readonly unknown[],
    string
  >({
    queryKey: mailKeys.infiniteThreads(filter),
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      listThreads({
        connectedAccountId: filter.connectedAccountId || "",
        mailboxId: filter.mailboxId || "",
        systemBucket:
          filter.systemBucket ?? ("MAILBOX_ROLE_UNSPECIFIED" as MailboxRole),
        isUnread: filter.isUnread,
        isStarred: filter.isStarred,
        query: filter.query || "",
        pageSize: filter.pageSize || 50,
        pageToken: pageParam || "",
      }),
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    refetchInterval: isTestEnv ? false : 60_000,
    refetchOnWindowFocus: true,
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

type ThreadsCacheValue =
  ListThreadsResponse | InfiniteData<ListThreadsResponse> | undefined

function mapThreadsCacheValue(
  data: ThreadsCacheValue,
  mapper: (threads: Thread[]) => Thread[]
): ThreadsCacheValue {
  if (!data) return data
  if ("pages" in data) {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        threads: mapper(page.threads),
      })),
    }
  }
  if ("threads" in data) {
    return {
      ...data,
      threads: mapper(data.threads),
    }
  }
  return data
}

export function useModifyThread(
  options?: UseMutationOptions<
    Thread,
    Error,
    ModifyThreadVariables,
    {
      previousQueries?: Array<[readonly unknown[], ThreadsCacheValue]>
    }
  >
) {
  const queryClient = useQueryClient()

  return useMutation<
    Thread,
    Error,
    ModifyThreadVariables,
    {
      previousQueries?: Array<[readonly unknown[], ThreadsCacheValue]>
    }
  >({
    mutationFn: ({ id, req }) => modifyThread(id, req),
    onMutate: async ({ id, req }) => {
      await queryClient.cancelQueries({ queryKey: mailKeys.allThreads() })

      const matchingQueries = queryClient.getQueriesData<ThreadsCacheValue>({
        queryKey: mailKeys.allThreads(),
      })
      const previousQueries: Array<[readonly unknown[], ThreadsCacheValue]> =
        matchingQueries.map(([key, data]) => [key, data])

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
        const isTrashView = filter.systemBucket === "MAILBOX_ROLE_TRASH"

        const updatedData = mapThreadsCacheValue(data, (threads) => {
          let updatedThreads = threads.map((t) => {
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

          if (req.inTrash && !isTrashView) {
            updatedThreads = updatedThreads.filter((t) => t.id !== id)
          } else if (isInboxView && (isArchiving || req.inSpam)) {
            updatedThreads = updatedThreads.filter((t) => t.id !== id)
          }
          return updatedThreads
        })

        queryClient.setQueryData<ThreadsCacheValue>(key, updatedData)
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
      previousQueries?: Array<[readonly unknown[], ThreadsCacheValue]>
    }
  >
) {
  const queryClient = useQueryClient()

  return useMutation<
    Record<string, never>,
    Error,
    BatchModifyThreadsRequest,
    {
      previousQueries?: Array<[readonly unknown[], ThreadsCacheValue]>
    }
  >({
    mutationFn: (req) => batchModifyThreads(req),
    onMutate: async (req) => {
      await queryClient.cancelQueries({ queryKey: mailKeys.allThreads() })

      const matchingQueries = queryClient.getQueriesData<ThreadsCacheValue>({
        queryKey: mailKeys.allThreads(),
      })
      const previousQueries: Array<[readonly unknown[], ThreadsCacheValue]> =
        matchingQueries.map(([key, data]) => [key, data])

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
        const isTrashView = filter.systemBucket === "MAILBOX_ROLE_TRASH"

        const updatedData = mapThreadsCacheValue(data, (threads) => {
          let updatedThreads = threads.map((t) => {
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

          if (req.inTrash && !isTrashView) {
            updatedThreads = updatedThreads.filter(
              (t) => !threadIdsSet.has(t.id)
            )
          } else if (isInboxView && (isArchiving || req.inSpam)) {
            updatedThreads = updatedThreads.filter(
              (t) => !threadIdsSet.has(t.id)
            )
          }
          return updatedThreads
        })

        queryClient.setQueryData<ThreadsCacheValue>(key, updatedData)
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
