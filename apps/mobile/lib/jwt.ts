export interface JwtClaims {
  sub: string
  role?: "admin" | "user"
  email?: string
  name?: string
  username?: string
  exp?: number
}

// Cross-platform Base64 decoder for React Native
function base64Decode(str: string): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
  let output = ""
  str = String(str).replace(/=+$/, "")

  if (str.length % 4 === 1) {
    throw new Error("Invalid base64 string")
  }

  for (
    let bc = 0, bs = 0, buffer: number, idx = 0;
    (buffer = str.charCodeAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(String.fromCharCode(buffer))
  }

  return output
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = base64Decode(base64)
    return JSON.parse(decoded) as JwtClaims
  } catch {
    return null
  }
}
