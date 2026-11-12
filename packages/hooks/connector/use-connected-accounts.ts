import {
  useQuery,
  type UseQueryOptions,
  useMutation,
  type UseMutationOptions,
  useQueryClient,
} from "@tanstack/react-query"
import {
  listProviders,
  initiateOAuth,
  listConnectedAccounts,
  getConnectedAccount,
  updateConnectedAccount,
  deleteConnectedAccount,
  syncConnectedAccount,
  suggestContacts,
  type ProviderDescriptor,
  type ListProvidersResponse,
  type InitiateOAuthRequest,
  type InitiateOAuthResponse,
  type ConnectedAccount,
  type ListConnectedAccountsRequest,
  type ListConnectedAccountsResponse,
  type GetConnectedAccountRequest,
  type UpdateConnectedAccountRequest,
  type DeleteConnectedAccountRequest,
  type SyncConnectedAccountRequest,
  type SyncConnectedAccountResponse,
  type AccountContact,
  type SuggestContactsRequest,
  type SuggestContactsResponse,
} from "@saturn/api/saturn/platform/connector/v1/connector"

export type {
  ProviderDescriptor,
  ListProvidersResponse,
  InitiateOAuthRequest,
  InitiateOAuthResponse,
  ConnectedAccount,
  ListConnectedAccountsRequest,
  ListConnectedAccountsResponse,
  GetConnectedAccountRequest,
  UpdateConnectedAccountRequest,
  DeleteConnectedAccountRequest,
  SyncConnectedAccountRequest,
  SyncConnectedAccountResponse,
  AccountContact,
  SuggestContactsRequest,
  SuggestContactsResponse,
}

export const connectorKeys = {
  all: (spaceId?: string) => ["connector", spaceId] as const,
  providers: () => ["connector", "providers"] as const,
  accounts: (spaceId?: string, provider?: string) =>
    ["connector", spaceId, "accounts", { provider }] as const,
  account: (spaceId?: string, id?: string) =>
    ["connector", spaceId, "account", id] as const,
  contacts: (spaceId?: string, query?: string) =>
    ["connector", spaceId, "contacts", { query }] as const,
}

export function useConnectorProviders(
  options?: Omit<
    UseQueryOptions<ListProvidersResponse, Error>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery<ListProvidersResponse, Error>({
    queryKey: connectorKeys.providers(),
    queryFn: () => listProviders({}),
    ...options,
  })
}

export interface UseConnectedAccountsParams {
  spaceId?: string
  provider?: string
}

export function useConnectedAccounts(
  params?: string | UseConnectedAccountsParams,
  options?: Omit<
    UseQueryOptions<ListConnectedAccountsResponse, Error>,
    "queryKey" | "queryFn"
  >
) {
  const spaceId = typeof params === "string" ? params : params?.spaceId
  const provider = typeof params === "object" ? params.provider : undefined

  return useQuery<ListConnectedAccountsResponse, Error>({
    queryKey: connectorKeys.accounts(spaceId, provider),
    queryFn: () => listConnectedAccounts({ provider }),
    enabled:
      options?.enabled !== undefined
        ? options.enabled
        : spaceId !== undefined
          ? Boolean(spaceId)
          : true,
    ...options,
  })
}

export function useGetConnectedAccount(
  id?: string,
  params?: { spaceId?: string },
  options?: Omit<
    UseQueryOptions<ConnectedAccount, Error>,
    "queryKey" | "queryFn"
  >
) {
  const spaceId = params?.spaceId
  return useQuery<ConnectedAccount, Error>({
    queryKey: connectorKeys.account(spaceId, id),
    queryFn: () => getConnectedAccount(id || "", { id: id || "" }),
    enabled:
      (options?.enabled !== undefined ? options.enabled : true) && Boolean(id),
    ...options,
  })
}

export function useInitiateOAuth(
  options?: UseMutationOptions<
    InitiateOAuthResponse,
    Error,
    InitiateOAuthRequest
  >
) {
  return useMutation<InitiateOAuthResponse, Error, InitiateOAuthRequest>({
    mutationFn: (req) => initiateOAuth(req),
    ...options,
  })
}

export interface UpdateConnectedAccountVariables {
  id: string
  spaceId?: string
  req?: UpdateConnectedAccountRequest
  account?: ConnectedAccount
  updateMask?: { paths?: string[] }
}

export function useUpdateConnectedAccount(
  options?: UseMutationOptions<
    ConnectedAccount,
    Error,
    UpdateConnectedAccountVariables
  > & { spaceId?: string }
) {
  const queryClient = useQueryClient()
  const {
    spaceId: defaultSpaceId,
    onSuccess: userOnSuccess,
    ...restOptions
  } = options || {}

  return useMutation<ConnectedAccount, Error, UpdateConnectedAccountVariables>({
    mutationFn: async (variables) => {
      const req: UpdateConnectedAccountRequest = variables.req || {
        id: variables.id,
        account: variables.account || ({} as ConnectedAccount),
        updateMask: variables.updateMask || { paths: [] },
      }
      return updateConnectedAccount(variables.id, req)
    },
    ...restOptions,
    onSuccess: async (...args) => {
      const [data, variables] = args
      const spaceId = variables.spaceId || defaultSpaceId || data.spaceId

      await queryClient.invalidateQueries({
        queryKey: connectorKeys.all(spaceId),
      })

      const paths =
        variables.req?.updateMask?.paths || variables.updateMask?.paths || []
      const hasCapChanges =
        paths.length === 0 ||
        paths.includes("enabled_capabilities") ||
        paths.includes("enabledCapabilities")

      if (hasCapChanges) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["calendar", spaceId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["mail", spaceId],
          }),
        ])
      }

      await userOnSuccess?.(...args)
    },
  })
}

export interface DeleteConnectedAccountVariables {
  id: string
  spaceId?: string
  req?: DeleteConnectedAccountRequest
}

export function useDeleteConnectedAccount(
  options?: UseMutationOptions<
    Record<string, never>,
    Error,
    DeleteConnectedAccountVariables
  > & { spaceId?: string }
) {
  const queryClient = useQueryClient()
  const {
    spaceId: defaultSpaceId,
    onSuccess: userOnSuccess,
    ...restOptions
  } = options || {}

  return useMutation<
    Record<string, never>,
    Error,
    DeleteConnectedAccountVariables
  >({
    mutationFn: async (variables) => {
      const req = variables.req || { id: variables.id }
      return deleteConnectedAccount(variables.id, req)
    },
    ...restOptions,
    onSuccess: async (...args) => {
      const [, variables] = args
      const spaceId = variables.spaceId || defaultSpaceId

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: connectorKeys.all(spaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["calendar", spaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["mail", spaceId],
        }),
      ])

      await userOnSuccess?.(...args)
    },
  })
}

export interface SyncConnectedAccountVariables {
  id: string
  spaceId?: string
  req?: SyncConnectedAccountRequest
}

export function useSyncConnectedAccount(
  options?: UseMutationOptions<
    SyncConnectedAccountResponse,
    Error,
    SyncConnectedAccountVariables
  > & { spaceId?: string }
) {
  const queryClient = useQueryClient()
  const {
    spaceId: defaultSpaceId,
    onSuccess: userOnSuccess,
    ...restOptions
  } = options || {}

  return useMutation<
    SyncConnectedAccountResponse,
    Error,
    SyncConnectedAccountVariables
  >({
    mutationFn: async (variables) => {
      const req = variables.req || { id: variables.id }
      return syncConnectedAccount(variables.id, req)
    },
    ...restOptions,
    onSuccess: async (...args) => {
      const [data, variables] = args
      const spaceId =
        variables.spaceId || defaultSpaceId || data.account?.spaceId

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: connectorKeys.all(spaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["calendar", spaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["mail", spaceId],
        }),
      ])

      await userOnSuccess?.(...args)
    },
  })
}

export interface UseContactSuggestionsOptions extends Omit<
  UseQueryOptions<SuggestContactsResponse, Error>,
  "queryKey" | "queryFn"
> {
  spaceId?: string
  limit?: number
}

export function useContactSuggestions(
  query: string,
  options?: UseContactSuggestionsOptions
) {
  const { spaceId, limit = 20, enabled = true, ...queryOptions } = options || {}

  return useQuery<SuggestContactsResponse, Error>({
    queryKey: connectorKeys.contacts(spaceId, query),
    queryFn: () => suggestContacts({ query, limit }),
    enabled:
      Boolean(enabled) &&
      query.trim().length > 0 &&
      (spaceId !== undefined ? Boolean(spaceId) : true),
    ...queryOptions,
  })
}
