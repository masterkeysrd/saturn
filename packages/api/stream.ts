import {
  buildApiError,
  getClientConfig,
  getClientLocale,
  refreshSession,
} from "./client"
import { defaultStorage } from "./storage"

export interface StreamSSEOptions<TEvent = unknown> {
  url: string
  method?: string
  body?: BodyInit | Record<string, unknown>
  headers?: Record<string, string>
  signal?: AbortSignal
  onEvent: (event: TEvent, eventType?: string) => void
}

function isBodyInit(value: unknown): value is BodyInit {
  if (typeof value === "string") return true
  if (typeof FormData !== "undefined" && value instanceof FormData) return true
  if (typeof Blob !== "undefined" && value instanceof Blob) return true
  if (
    typeof URLSearchParams !== "undefined" &&
    value instanceof URLSearchParams
  )
    return true
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream)
    return true
  return false
}

function resolveRequestBody(body: StreamSSEOptions["body"]): {
  encodedBody?: BodyInit
  isJson: boolean
} {
  if (body === undefined) {
    return { encodedBody: undefined, isJson: false }
  }
  if (isBodyInit(body)) {
    const isFormData =
      typeof FormData !== "undefined" && body instanceof FormData
    return {
      encodedBody: body,
      isJson: !isFormData && typeof body === "string",
    }
  }
  return { encodedBody: JSON.stringify(body), isJson: true }
}

function processSSEFrames<TEvent>(
  buffer: string,
  flushFinal: boolean,
  onEvent: (event: TEvent, eventType?: string) => void
): string {
  const normalized = buffer.replace(/\r\n/g, "\n")
  const parts = normalized.split("\n\n")
  const remainder = flushFinal ? "" : (parts.pop() ?? "")

  for (const frame of parts) {
    if (!frame.trim()) continue

    let eventType: string | undefined
    const dataLines: string[] = []

    for (const line of frame.split("\n")) {
      if (line.startsWith(":") || line === "") continue
      const colonIdx = line.indexOf(":")
      const field = colonIdx === -1 ? line : line.slice(0, colonIdx)
      let value = colonIdx === -1 ? "" : line.slice(colonIdx + 1)
      if (value.startsWith(" ")) {
        value = value.slice(1)
      }

      if (field === "event") {
        eventType = value
      } else if (field === "data") {
        dataLines.push(value)
      }
    }

    if (dataLines.length === 0) continue
    const rawData = dataLines.join("\n")
    if (rawData === "[DONE]") continue

    let parsed: TEvent
    try {
      parsed = JSON.parse(rawData) as TEvent
    } catch {
      continue
    }
    onEvent(parsed, eventType)
  }

  return remainder
}

export async function streamSSE<TEvent = unknown>({
  url,
  method = "POST",
  body,
  headers: customHeaders,
  signal,
  onEvent,
}: StreamSSEOptions<TEvent>): Promise<void> {
  const config = getClientConfig()
  const storage = config.storage || defaultStorage
  const session = await storage.getSession()
  const token = session.accessToken
  const spaceId = await storage.getActiveSpaceId()

  const baseUrl = config.baseUrl || ""
  const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`
  const { encodedBody, isJson } = resolveRequestBody(body)

  const buildHeaders = (authToken: string | null): Record<string, string> => {
    const hdrs: Record<string, string> = {
      Accept: "text/event-stream",
    }
    if (isJson) {
      hdrs["Content-Type"] = "application/json"
    }
    if (authToken) {
      hdrs["Authorization"] = `Bearer ${authToken}`
    }
    if (spaceId) {
      hdrs["Space-Id"] = spaceId
    }
    const resolvedLocale = getClientLocale()
    if (resolvedLocale) {
      hdrs["Accept-Language"] = resolvedLocale
    }
    if (customHeaders) {
      for (const [k, v] of Object.entries(customHeaders)) {
        if (k.toLowerCase() === "accept-language") {
          delete hdrs["Accept-Language"]
        }
        hdrs[k] = v
      }
    }
    return hdrs
  }

  let response = await fetch(fullUrl, {
    method,
    headers: buildHeaders(token),
    ...(encodedBody !== undefined && { body: encodedBody }),
    signal,
    credentials: "same-origin",
  })

  if (response.status === 401) {
    let newAccessToken: string
    try {
      newAccessToken = await refreshSession()
    } catch (refreshErr) {
      config.onUnauthorized?.()
      throw refreshErr
    }

    response = await fetch(fullUrl, {
      method,
      headers: buildHeaders(newAccessToken),
      ...(encodedBody !== undefined && { body: encodedBody }),
      signal,
      credentials: "same-origin",
    })

    if (response.status === 401) {
      const retryError = await buildApiError(response)
      config.onUnauthorized?.()
      throw retryError
    }
  }

  if (!response.ok) {
    throw await buildApiError(response)
  }

  if (!response.body) {
    const text = await response.text()
    if (text) {
      processSSEFrames(text, true, onEvent)
    }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined)
        const abortErr = new Error("Stream aborted")
        abortErr.name = "AbortError"
        throw abortErr
      }

      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        processSSEFrames(buffer, true, onEvent)
        break
      }

      buffer += decoder.decode(value, { stream: true })
      buffer = processSSEFrames(buffer, false, onEvent)
    }
  } finally {
    reader.releaseLock()
  }
}
