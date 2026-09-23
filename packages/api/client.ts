import { defaultStorage, type StorageAdapter } from "./storage"

export interface RequestOptions<TData = unknown, TParams = unknown> {
  method: string
  url: string
  data?: TData
  params?: TParams
}

export interface ClientConfig {
  baseUrl?: string
  storage?: StorageAdapter
  onUnauthorized?: () => void
  onRefreshed?: (accessToken: string) => void
}

let clientConfig: ClientConfig = {
  baseUrl: "",
  storage: defaultStorage,
  onUnauthorized: () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:unauthorized"))
    }
  },
  onRefreshed: (accessToken: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("auth:refreshed", {
          detail: { accessToken },
        })
      )
    }
  },
}

export function configureClient(config: Partial<ClientConfig>): void {
  clientConfig = {
    ...clientConfig,
    ...config,
    storage: config.storage || clientConfig.storage,
  }
}

export function getClientConfig(): ClientConfig {
  return clientConfig
}

let refreshPromise: Promise<string> | null = null

async function performRefresh(): Promise<string> {
  const storage = clientConfig.storage || defaultStorage
  const session = await storage.getSession()
  if (!session.hasSession) {
    throw new Error("No session available")
  }

  const baseUrl = clientConfig.baseUrl || ""
  const refreshUrl = `${baseUrl}/api/v1/identity/sessions:refresh`

  const storedRefreshToken = storage.getRefreshToken
    ? await storage.getRefreshToken()
    : null

  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refreshToken: storedRefreshToken || "",
    }),
    credentials: "same-origin",
  })

  if (!response.ok) {
    throw new Error("Refresh request failed")
  }

  const data = await response.json()
  if (!data.accessToken || !data.refreshToken) {
    throw new Error("Invalid refresh response")
  }

  await storage.setSession(data.accessToken)
  if (data.refreshToken && storage.setRefreshToken) {
    await storage.setRefreshToken(data.refreshToken)
  }
  clientConfig.onRefreshed?.(data.accessToken)

  return data.accessToken
}

export async function request<TResponse, TData = unknown, TParams = unknown>({
  method,
  url,
  data,
  params,
}: RequestOptions<TData, TParams>): Promise<TResponse> {
  const storage = clientConfig.storage || defaultStorage
  const session = await storage.getSession()
  const token = session.accessToken
  const spaceId = await storage.getActiveSpaceId()

  const baseUrl = clientConfig.baseUrl || ""
  let fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`

  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params as Record<string, unknown>).forEach(
      ([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          if (
            typeof value === "object" &&
            value !== null &&
            "paths" in value &&
            Array.isArray((value as { paths?: unknown }).paths)
          ) {
            const paths = (value as { paths: string[] }).paths
            if (paths.length > 0) {
              const formattedPaths = paths.map((p) =>
                p.replace(/([A-Z])/g, "_$1").toLowerCase()
              )
              searchParams.append(key, formattedPaths.join(","))
            }
          } else if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item !== undefined && item !== null && item !== "") {
                searchParams.append(key, String(item))
              }
            })
          } else {
            searchParams.append(key, String(value))
          }
        }
      }
    )
    const queryString = searchParams.toString()
    if (queryString) {
      fullUrl = `${fullUrl}${fullUrl.includes("?") ? "&" : "?"}${queryString}`
    }
  }

  const response = await fetch(fullUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(spaceId && { "Space-Id": spaceId }),
    },
    ...(data && { body: JSON.stringify(data) }),
    credentials: "same-origin",
  })

  if (!response.ok) {
    if (response.status === 401) {
      const isAuthEndpoint =
        url.includes("/identity/users:login") ||
        url.includes("/identity/users:register") ||
        url.includes("/identity/sessions:refresh")
      if (!isAuthEndpoint) {
        try {
          if (!refreshPromise) {
            refreshPromise = performRefresh().finally(() => {
              refreshPromise = null
            })
          }
          const newAccessToken = await refreshPromise

          const retryResponse = await fetch(fullUrl, {
            method,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newAccessToken}`,
              ...(spaceId && { "Space-Id": spaceId }),
            },
            ...(data && { body: JSON.stringify(data) }),
            credentials: "same-origin",
          })

          if (retryResponse.ok) {
            if (retryResponse.status === 204) {
              return {} as TResponse
            }
            const text = await retryResponse.text()
            if (!text) {
              return {} as TResponse
            }
            return JSON.parse(text) as TResponse
          }

          if (retryResponse.status === 401) {
            clientConfig.onUnauthorized?.()
          }
          const errorData = await retryResponse.json().catch(() => ({}))
          throw new Error(
            errorData.message ||
              `Request failed with status ${retryResponse.status}`
          )
        } catch (refreshErr) {
          clientConfig.onUnauthorized?.()
          throw refreshErr
        }
      }
    }
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      errorData.message || `Request failed with status ${response.status}`
    )
  }

  // gRPC Gateway/REST 204 No Content or empty responses
  if (response.status === 204) {
    return {} as TResponse
  }

  const text = await response.text()
  if (!text) {
    return {} as TResponse
  }

  try {
    return JSON.parse(text) as TResponse
  } catch {
    return text as unknown as TResponse
  }
}
