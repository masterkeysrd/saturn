export interface JwtClaims {
  sub: string
  role?: "admin" | "user"
  email?: string
  name?: string
  username?: string
  exp?: number
}

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const BASE64_QUANTUM = 4
const BASE64_RADIX = 64
const BASE64_INVALID_REMAINDER = 1
const BASE64_BIT_SHIFT_STEP = 2
const BASE64_BIT_SHIFT_MASK = 6
const BYTE_MASK = 0xff

const JWT_MIN_SEGMENTS = 2
const JWT_PAYLOAD_INDEX = 1
const HEX_RADIX = 16
const HEX_PAD_WIDTH = 2
const DEFAULT_EXPIRY_BUFFER_SECONDS = 30
const MS_PER_SECOND = 1000

function decodeBase64Bytes(base64: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const bin = globalThis.atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i)
    }
    return bytes
  }

  let end = base64.length
  while (end > 0 && base64.charCodeAt(end - 1) === 61) {
    end--
  }
  const clean = end === base64.length ? base64 : base64.slice(0, end)
  if (clean.length % BASE64_QUANTUM === BASE64_INVALID_REMAINDER) {
    throw new Error("Invalid base64 string")
  }

  const out: number[] = []
  let charCount = 0
  let bitBuffer = 0
  for (let idx = 0; idx < clean.length; idx++) {
    const val = BASE64_CHARS.indexOf(clean.charAt(idx))
    if (val === -1) continue
    bitBuffer =
      charCount % BASE64_QUANTUM ? bitBuffer * BASE64_RADIX + val : val
    if (charCount++ % BASE64_QUANTUM) {
      out.push(
        BYTE_MASK &
          (bitBuffer >>
            ((-BASE64_BIT_SHIFT_STEP * charCount) & BASE64_BIT_SHIFT_MASK))
      )
    }
  }
  return new Uint8Array(out)
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split(".")
    if (parts.length < JWT_MIN_SEGMENTS || !parts[JWT_PAYLOAD_INDEX]) {
      return null
    }

    let base64 = parts[JWT_PAYLOAD_INDEX].replace(/-/g, "+").replace(/_/g, "/")
    const remainder = base64.length % BASE64_QUANTUM
    if (remainder > 0) {
      base64 += "=".repeat(BASE64_QUANTUM - remainder)
    }

    const bytes = decodeBase64Bytes(base64)
    const jsonPayload =
      typeof TextDecoder !== "undefined"
        ? new TextDecoder().decode(bytes)
        : decodeURIComponent(
            Array.from(
              bytes,
              (b) =>
                "%" +
                ("0".repeat(HEX_PAD_WIDTH) + b.toString(HEX_RADIX)).slice(
                  -HEX_PAD_WIDTH
                )
            ).join("")
          )

    return JSON.parse(jsonPayload) as JwtClaims
  } catch {
    return null
  }
}

export function isTokenExpired(
  token: string,
  bufferSeconds = DEFAULT_EXPIRY_BUFFER_SECONDS
): boolean {
  const decoded = decodeJwt(token)
  if (!decoded || !decoded.exp) return true
  const nowSeconds = Math.floor(Date.now() / MS_PER_SECOND)
  return decoded.exp - bufferSeconds <= nowSeconds
}
