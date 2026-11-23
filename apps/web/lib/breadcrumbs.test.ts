import { describe, expect, it } from "vitest"
import { resolveBreadcrumbs } from "./breadcrumbs"

describe("resolveBreadcrumbs", () => {
  it("translates settings OAuth routes distinctly in English and Spanish", () => {
    expect(
      resolveBreadcrumbs("/settings/security/oauth-apps", "en-US")
    ).toEqual([
      { label: "Settings", to: "/settings/account" },
      { label: "Authorized OAuth Apps" },
    ])
    expect(
      resolveBreadcrumbs("/settings/security/oauth-apps", "es-ES")
    ).toEqual([
      { label: "Configuración", to: "/settings/account" },
      { label: "Aplicaciones OAuth autorizadas" },
    ])

    expect(resolveBreadcrumbs("/settings/oauth-apps", "en-US")).toEqual([
      { label: "Settings", to: "/settings/account" },
      { label: "Workspace OAuth Apps" },
    ])
    expect(resolveBreadcrumbs("/settings/oauth-apps", "es-419")).toEqual([
      { label: "Configuración", to: "/settings/account" },
      { label: "Aplicaciones OAuth del espacio" },
    ])
  })

  it("translates admin routes using @saturn/i18n in English and Spanish", () => {
    expect(resolveBreadcrumbs("/admin/oauth-clients", "en-US")).toEqual([
      { label: "Admin", to: "/admin/users" },
      { label: "OAuth Clients" },
    ])
    expect(resolveBreadcrumbs("/admin/oauth-clients", "es-ES")).toEqual([
      { label: "Administración", to: "/admin/users" },
      { label: "Clientes OAuth" },
    ])
    expect(resolveBreadcrumbs("/admin/backups", "es-ES")).toEqual([
      { label: "Administración", to: "/admin/users" },
      { label: "Copias de seguridad" },
    ])
  })
})
