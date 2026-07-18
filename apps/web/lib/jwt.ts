export interface JwtClaims {
  sub: string
  email?: string
  name?: string
  username?: string
}

// Helper function to decode JWT payload without external library
export function decodeJwt(token: string): JwtClaims | null {
  try {
    const base64Url = token.split(".")[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    )
    return JSON.parse(jsonPayload) as JwtClaims
  } catch {
    return null
  }
}
