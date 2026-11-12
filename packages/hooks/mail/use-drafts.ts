import {
  useQuery,
  type UseQueryOptions,
  useMutation,
  type UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query"
import {
  listDrafts,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
  sendDraft,
  type Draft,
  type ListDraftsRequest,
  type ListDraftsResponse,
  type CreateDraftRequest,
  type UpdateDraftRequest,
  type DeleteDraftRequest,
  type SendDraftRequest,
  type Message,
} from "@saturn/api/saturn/mail/v1/mail"
import { mailKeys } from "./use-mail"

export type {
  Draft,
  ListDraftsRequest,
  ListDraftsResponse,
  CreateDraftRequest,
  UpdateDraftRequest,
  DeleteDraftRequest,
  SendDraftRequest,
}

export const draftKeys = {
  all: () => ["mail", "drafts"] as const,
  lists: (connectedAccountId?: string) =>
    ["mail", "drafts", "list", { connectedAccountId }] as const,
  draft: (id: string) => ["mail", "draft", id] as const,
}

export function useDrafts(
  connectedAccountId?: string,
  options?: Omit<
    UseQueryOptions<ListDraftsResponse, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery<ListDraftsResponse, Error>({
    queryKey: draftKeys.lists(connectedAccountId),
    queryFn: () =>
      listDrafts({
        connectedAccountId: connectedAccountId || "",
        threadId: "",
        pageSize: 50,
        pageToken: "",
      }),
    ...options,
  })
}

export function useDraft(
  id?: string,
  options?: Omit<UseQueryOptions<Draft, Error>, "queryKey" | "queryFn">
) {
  return useQuery<Draft, Error>({
    queryKey: draftKeys.draft(id || ""),
    queryFn: () => {
      if (!id) throw new Error("Draft ID is required")
      return getDraft(id, { id })
    },
    enabled:
      Boolean(id) && (options?.enabled !== undefined ? options.enabled : true),
    ...options,
  })
}

export function useCreateDraft(
  options?: UseMutationOptions<Draft, Error, CreateDraftRequest>
) {
  const queryClient = useQueryClient()

  return useMutation<Draft, Error, CreateDraftRequest>({
    mutationFn: (req) => createDraft(req),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: draftKeys.all() })
      await queryClient.invalidateQueries({ queryKey: mailKeys.all() })
      options?.onSuccess?.(...args)
    },
    ...options,
  })
}

export interface UpdateDraftVariables {
  id: string
  req: UpdateDraftRequest
}

export function useUpdateDraft(
  options?: UseMutationOptions<Draft, Error, UpdateDraftVariables>
) {
  const queryClient = useQueryClient()

  return useMutation<Draft, Error, UpdateDraftVariables>({
    mutationFn: ({ id, req }) => updateDraft(id, req),
    onSuccess: async (data, variables, context, mutation) => {
      queryClient.setQueryData(draftKeys.draft(variables.id), data)
      await queryClient.invalidateQueries({ queryKey: draftKeys.all() })
      options?.onSuccess?.(data, variables, context, mutation)
    },
    ...options,
  })
}

export interface SaveDraftVariables {
  id?: string
  connectedAccountId: string
  threadId?: string
  replyToMessageId?: string
  mode?: Draft["mode"]
  to?: Draft["to"]
  cc?: Draft["cc"]
  bcc?: Draft["bcc"]
  subject?: string
  bodyHtml?: string
  bodyText?: string
  attachments?: Draft["attachments"]
  version?: number | string
}

export function useSaveDraft(
  options?: UseMutationOptions<Draft, Error, SaveDraftVariables>
) {
  const queryClient = useQueryClient()

  return useMutation<Draft, Error, SaveDraftVariables>({
    mutationFn: async (variables) => {
      const { id, ...rest } = variables
      const draftObj = {
        ...rest,
        id: id || "",
        mode: rest.mode ?? "DRAFT_MODE_NEW",
        to: rest.to ?? [],
        cc: rest.cc ?? [],
        bcc: rest.bcc ?? [],
        subject: rest.subject ?? "",
        bodyHtml: rest.bodyHtml ?? "",
        bodyText: rest.bodyText ?? "",
        attachments: rest.attachments ?? [],
      } as unknown as Draft

      if (id) {
        return updateDraft(id, {
          id,
          draft: draftObj,
          updateMask: { paths: Object.keys(rest) },
        })
      } else {
        return createDraft({
          draft: draftObj,
        })
      }
    },
    onSuccess: async (data, variables, context, mutation) => {
      queryClient.setQueryData(draftKeys.draft(data.id), data)
      await queryClient.invalidateQueries({ queryKey: draftKeys.all() })
      options?.onSuccess?.(data, variables, context, mutation)
    },
    ...options,
  })
}

export interface DeleteDraftVariables {
  id: string
  req?: DeleteDraftRequest
}

export function useDeleteDraft(
  options?: UseMutationOptions<
    Record<string, never>,
    Error,
    DeleteDraftVariables
  >
) {
  const queryClient = useQueryClient()

  return useMutation<Record<string, never>, Error, DeleteDraftVariables>({
    mutationFn: ({ id, req }) => deleteDraft(id, req || { id }),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: draftKeys.all() })
      await queryClient.invalidateQueries({ queryKey: mailKeys.all() })
      options?.onSuccess?.(...args)
    },
    ...options,
  })
}

export interface SendDraftVariables {
  id: string
  req?: SendDraftRequest
}

export function useSendDraft(
  options?: UseMutationOptions<Message, Error, SendDraftVariables>
) {
  const queryClient = useQueryClient()

  return useMutation<Message, Error, SendDraftVariables>({
    mutationFn: ({ id, req }) => sendDraft(id, req || { id }),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({ queryKey: draftKeys.all() })
      await queryClient.invalidateQueries({ queryKey: mailKeys.all() })
      options?.onSuccess?.(...args)
    },
    ...options,
  })
}
