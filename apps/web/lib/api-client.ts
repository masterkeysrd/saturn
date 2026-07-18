import { authStorage } from "./auth-storage"

export interface RequestOptions<TData = unknown, TParams = unknown> {
  method: string
  url: string
  data?: TData
  params?: TParams
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
