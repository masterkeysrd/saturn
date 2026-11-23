import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { resolveSafeReturnTo } from "./auth-redirect"
import { ProtectedRoute } from "@/components/protected-route"
import { AuthContext } from "@/features/auth/auth-context"

function LoginLocationEcho() {
  const loc = useLocation()
  return <div data-testid="login-loc">{`${loc.pathname}${loc.search}`}</div>
}

describe("resolveSafeReturnTo", () => {
  it("accepts internal relative paths with query strings", () => {
    expect(
      resolveSafeReturnTo(
        "/oauth/authorize?client_id=oac_1&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb"
      )
    ).toBe(
      "/oauth/authorize?client_id=oac_1&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb"
    )
  })

  it("rejects open redirect vectors", () => {
    expect(resolveSafeReturnTo("https://evil.com/phish")).toBe("/")
    expect(resolveSafeReturnTo("//evil.com/phish")).toBe("/")
    expect(resolveSafeReturnTo("/\\evil.com")).toBe("/")
    expect(resolveSafeReturnTo("")).toBe("/")
    expect(resolveSafeReturnTo(null)).toBe("/")
  })
})

describe("ProtectedRoute return_to preservation", () => {
  afterEach(() => {
    cleanup()
  })

  it("redirects unauthenticated visitors to /login with encoded return_to", () => {
    render(
      <AuthContext.Provider
        value={{
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
          login: vi.fn(),
          register: vi.fn(),
          logoutUser: vi.fn(),
          updateAccessToken: vi.fn(),
          error: null,
          setError: vi.fn(),
        }}
      >
        <MemoryRouter
          initialEntries={["/oauth/authorize?client_id=oac_1&state=abc"]}
        >
          <Routes>
            <Route path="/login" element={<LoginLocationEcho />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/oauth/authorize" element={<div>Consent</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )

    expect(screen.getByTestId("login-loc").textContent).toBe(
      `/login?return_to=${encodeURIComponent("/oauth/authorize?client_id=oac_1&state=abc")}`
    )
  })
})
