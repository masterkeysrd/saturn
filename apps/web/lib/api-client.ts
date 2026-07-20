import { authStorage } from "./auth-storage"

export interface RequestOptions<TData = unknown, TParams = unknown> {
  method: string
  url: string
  data?: TData
  params?: TParams
}

let refreshPromise: Promise<string> | null = null

async function performRefresh(): Promise<string> {
  const session = authStorage.getSession()
  if (!session.refreshToken) {
    throw new Error("No refresh token available")
  }

  const response = await fetch("/api/v1/identity/sessions:refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  })

  if (!response.ok) {
    throw new Error("Refresh request failed")
  }

  const data = await response.json()
  if (!data.accessToken || !data.refreshToken) {
    throw new Error("Invalid refresh response")
  }

  authStorage.setSession(data.accessToken, data.refreshToken)
  window.dispatchEvent(
    new CustomEvent("auth:refreshed", {
      detail: { accessToken: data.accessToken },
    })
  )

  return data.accessToken
}

export async function request<TResponse, TData = unknown, TParams = unknown>({
  method,
  url,
  data,
  params,
}: RequestOptions<TData, TParams>): Promise<TResponse> {
  const token = authStorage.getSession().accessToken
  const spaceId = localStorage.getItem("active_space_id")

  let fullUrl = url

  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params as Record<string, unknown>).forEach(
      ([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      }
    )
    const queryString = searchParams.toString()
    if (queryString) {
      fullUrl = `${fullUrl}?${queryString}`
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
            window.dispatchEvent(new Event("auth:unauthorized"))
          }
          const errorData = await retryResponse.json().catch(() => ({}))
          throw new Error(
            errorData.message ||
              `Request failed with status ${retryResponse.status}`
          )
        } catch (refreshErr) {
          window.dispatchEvent(new Event("auth:unauthorized"))
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
