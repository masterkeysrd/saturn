import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  connectorKeys,
  useConnectedAccounts,
  useUpdateConnectedAccount,
  useDeleteConnectedAccount,
  useSyncConnectedAccount,
  useContactSuggestions,
} from "./use-connected-accounts"
import * as api from "@saturn/api/saturn/platform/connector/v1/connector"

vi.mock("@saturn/api/saturn/platform/connector/v1/connector", async () => {
  const actual = await vi.importActual<typeof api>(
    "@saturn/api/saturn/platform/connector/v1/connector"
  )
  return {
    ...actual,
    listConnectedAccounts: vi.fn(),
    updateConnectedAccount: vi.fn(),
    deleteConnectedAccount: vi.fn(),
    syncConnectedAccount: vi.fn(),
    suggestContacts: vi.fn(),
  }
})

describe("connector hooks and cache invalidation", () => {
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

  describe("connectorKeys", () => {
    it("generates correct query keys scoped by spaceId", () => {
      expect(connectorKeys.all("spc_123")).toEqual(["connector", "spc_123"])
      expect(connectorKeys.providers()).toEqual(["connector", "providers"])
      expect(connectorKeys.accounts("spc_123", "google")).toEqual([
        "connector",
        "spc_123",
        "accounts",
        { provider: "google" },
      ])
      expect(connectorKeys.account("spc_123", "cac_456")).toEqual([
        "connector",
        "spc_123",
        "account",
        "cac_456",
      ])
      expect(connectorKeys.contacts("spc_123", "john")).toEqual([
        "connector",
        "spc_123",
        "contacts",
        { query: "john" },
      ])
    })
  })

  describe("useConnectedAccounts", () => {
    it("scopes query key by spaceId and calls api", async () => {
      const mockAccounts = [
        {
          id: "cac_1",
          email: "test@example.com",
          provider: "google",
          enabledCapabilities: ["calendar"],
        },
      ]
      vi.mocked(api.listConnectedAccounts).mockResolvedValueOnce({
        accounts: mockAccounts,
      })

      const { result } = renderHook(
        () => useConnectedAccounts({ spaceId: "spc_abc", provider: "google" }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(api.listConnectedAccounts).toHaveBeenCalledWith({
        provider: "google",
      })
      expect(result.current.data?.accounts).toEqual(mockAccounts)
    })
  })

  describe("useUpdateConnectedAccount cache invalidation", () => {
    it("invalidates connector, calendar, and mail queries when capabilities change", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
      vi.mocked(api.updateConnectedAccount).mockResolvedValueOnce({
        id: "cac_1",
        spaceId: "spc_abc",
        enabledCapabilities: ["calendar", "mail"],
      })

      const { result } = renderHook(
        () => useUpdateConnectedAccount({ spaceId: "spc_abc" }),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        await result.current.mutateAsync({
          id: "cac_1",
          spaceId: "spc_abc",
          req: {
            id: "cac_1",
            account: { enabledCapabilities: ["calendar", "mail"] },
            updateMask: { paths: ["enabled_capabilities"] },
          },
        })
      })

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["connector", "spc_abc"],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["calendar", "spc_abc"],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["mail", "spc_abc"],
      })
    })

    it("only invalidates connector query when updating non-capability fields (e.g. color)", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
      vi.mocked(api.updateConnectedAccount).mockResolvedValueOnce({
        id: "cac_1",
        spaceId: "spc_abc",
        color: "#3b82f6",
        enabledCapabilities: ["calendar"],
      })

      const { result } = renderHook(
        () => useUpdateConnectedAccount({ spaceId: "spc_abc" }),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        await result.current.mutateAsync({
          id: "cac_1",
          spaceId: "spc_abc",
          req: {
            id: "cac_1",
            account: { color: "#3b82f6", enabledCapabilities: ["calendar"] },
            updateMask: { paths: ["color"] },
          },
        })
      })

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["connector", "spc_abc"],
      })
      expect(invalidateSpy).not.toHaveBeenCalledWith({
        queryKey: ["calendar", "spc_abc"],
      })
      expect(invalidateSpy).not.toHaveBeenCalledWith({
        queryKey: ["mail", "spc_abc"],
      })
    })
  })

  describe("useDeleteConnectedAccount cache invalidation", () => {
    it("invalidates connector, calendar, and mail queries on disconnect", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
      vi.mocked(api.deleteConnectedAccount).mockResolvedValueOnce({})

      const { result } = renderHook(
        () => useDeleteConnectedAccount({ spaceId: "spc_abc" }),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        await result.current.mutateAsync({
          id: "cac_1",
          spaceId: "spc_abc",
        })
      })

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["connector", "spc_abc"],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["calendar", "spc_abc"],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["mail", "spc_abc"],
      })
    })
  })

  describe("useSyncConnectedAccount cache invalidation", () => {
    it("invalidates connector, calendar, and mail queries on sync", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
      vi.mocked(api.syncConnectedAccount).mockResolvedValueOnce({
        account: { id: "cac_1", spaceId: "spc_abc", enabledCapabilities: [] },
      })

      const { result } = renderHook(
        () => useSyncConnectedAccount({ spaceId: "spc_abc" }),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        await result.current.mutateAsync({
          id: "cac_1",
          spaceId: "spc_abc",
        })
      })

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["connector", "spc_abc"],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["calendar", "spc_abc"],
      })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["mail", "spc_abc"],
      })
    })
  })
})
