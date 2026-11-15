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

export interface FieldViolation {
  field: string
  description: string
}

export class SaturnApiError extends Error {
  readonly status: number
  readonly code?: number | string
  readonly reason?: string
  readonly metadata?: Record<string, string>
  readonly fieldViolations?: FieldViolation[]
  readonly details?: unknown[]

  constructor(opts: {
    message: string
    status: number
    code?: number | string
    reason?: string
    metadata?: Record<string, string>
    fieldViolations?: FieldViolation[]
    details?: unknown[]
  }) {
    super(opts.message)
    this.name = "SaturnApiError"
    this.status = opts.status
    this.code = opts.code
    this.reason = opts.reason
    this.metadata = opts.metadata
    this.fieldViolations = opts.fieldViolations
    this.details = opts.details
    Object.setPrototypeOf(this, SaturnApiError.prototype)
  }
}

async function buildApiError(response: Response): Promise<SaturnApiError> {
  const raw = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  const payload =
    raw && typeof raw.error === "object" && raw.error !== null
      ? (raw.error as Record<string, unknown>)
      : raw

  const message =
    typeof payload?.message === "string" && payload.message
      ? payload.message
      : `Request failed with status ${response.status}`

  const code =
    typeof payload?.code === "number" || typeof payload?.code === "string"
      ? payload.code
      : undefined

  const details = Array.isArray(payload?.details)
    ? (payload.details as unknown[])
    : undefined

  let reason: string | undefined
  let metadata: Record<string, string> | undefined
  let fieldViolations: FieldViolation[] | undefined

  if (details) {
    for (const item of details) {
      if (!item || typeof item !== "object") continue
      const detail = item as Record<string, unknown>
      const typeUrl = typeof detail["@type"] === "string" ? detail["@type"] : ""

      if (
        typeUrl.includes("ErrorInfo") ||
        (typeof detail.reason === "string" && typeof detail.domain === "string")
      ) {
        if (typeof detail.reason === "string" && detail.reason) {
          reason = detail.reason
        }
        if (
          detail.metadata &&
          typeof detail.metadata === "object" &&
          !Array.isArray(detail.metadata)
        ) {
          metadata = detail.metadata as Record<string, string>
        }
      }

      if (
        typeUrl.includes("BadRequest") ||
        Array.isArray(detail.fieldViolations)
      ) {
        if (Array.isArray(detail.fieldViolations)) {
          fieldViolations = detail.fieldViolations.filter(
            (fv): fv is FieldViolation =>
              Boolean(fv) &&
              typeof fv === "object" &&
              typeof (fv as FieldViolation).field === "string" &&
              typeof (fv as FieldViolation).description === "string"
          )
        }
      }
    }
  }

  return new SaturnApiError({
    message,
    status: response.status,
    code,
    reason,
    metadata,
    fieldViolations,
    details,
  })
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
    throw await buildApiError(response)
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

export function refreshSession(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
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
    const apiError = await buildApiError(response)

    const isAuthEndpoint =
      url.includes("/identity/users:login") ||
      url.includes("/identity/users:register") ||
      url.includes("/identity/sessions:refresh") ||
      url.includes("/identity/users:change-password") ||
      url.includes("/identity/users/me:change-email") ||
      url.includes("/identity/users/me:delete")

    const isCredentialFailure =
      apiError.reason === "INVALID_CREDENTIALS" ||
      apiError.reason === "MFA_INVALID_CODE"

    if (response.status === 401 && !isAuthEndpoint && !isCredentialFailure) {
      let newAccessToken: string
      try {
        newAccessToken = await refreshSession()
      } catch (refreshErr) {
        clientConfig.onUnauthorized?.()
        throw refreshErr
      }

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
        try {
          return JSON.parse(text) as TResponse
        } catch {
          return text as unknown as TResponse
        }
      }

      const retryError = await buildApiError(retryResponse)
      if (
        retryResponse.status === 401 &&
        retryError.reason !== "INVALID_CREDENTIALS" &&
        retryError.reason !== "MFA_INVALID_CODE"
      ) {
        clientConfig.onUnauthorized?.()
      }
      throw retryError
    }

    throw apiError
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
