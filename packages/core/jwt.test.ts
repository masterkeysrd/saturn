import { describe, it, expect } from "vitest"
import { decodeJwt, isTokenExpired } from "./jwt"

function makeToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "EdDSA", typ: "JWT" }))
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let bin = ""
  for (const b of bytes) {
    bin += String.fromCharCode(b)
  }
  const body = btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  return `${header}.${body}.sig`
}

describe("jwt utilities", () => {
  it("decodes base64url payloads including UTF-8 characters", () => {
    const token = makeToken({
      sub: "usr_123",
      name: "José Núñez 🚀",
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 600,
    })

    const claims = decodeJwt(token)
    expect(claims).toMatchObject({
      sub: "usr_123",
      name: "José Núñez 🚀",
      role: "admin",
    })
    expect(isTokenExpired(token)).toBe(false)
  })

  it("returns null for malformed tokens and treats missing/past exp as expired", () => {
    expect(decodeJwt("invalid")).toBeNull()
    const expired = makeToken({
      sub: "usr_1",
      exp: Math.floor(Date.now() / 1000) - 10,
    })
    expect(isTokenExpired(expired)).toBe(true)
  })

  it("decodes padded tokens via pure JS fallback when atob is unavailable without ReDoS", () => {
    const originalAtob = globalThis.atob
    try {
      const token = makeToken({
        sub: "usr_fallback",
        name: "Alice",
        exp: Math.floor(Date.now() / 1000) + 600,
      })
      const [hdr, payload, sig] = token.split(".")
      const paddedPayload =
        payload + "=".repeat((4 - (payload.length % 4)) % 4) + "=".repeat(10000)

      // @ts-expect-error testing pure-JS fallback when atob is absent
      globalThis.atob = undefined

      const start = performance.now()
      const decoded = decodeJwt(`${hdr}.${paddedPayload}.${sig}`)
      const pathological = decodeJwt(`${hdr}.${"=".repeat(10000)}a.${sig}`)
      const elapsedMs = performance.now() - start

      expect(decoded).toMatchObject({ sub: "usr_fallback", name: "Alice" })
      expect(pathological).toBeNull()
      expect(elapsedMs).toBeLessThan(50)
    } finally {
      globalThis.atob = originalAtob
    }
  })
})
