import { describe, expect, it } from "vitest"
import enLocaleJson from "./locales/en.json"
import esLocaleJson from "./locales/es.json"
import enSchemaJson from "./schemas/en.json"
import esSchemaJson from "./schemas/es.json"
import {
  SUPPORTED_UI_LOCALES,
  enEnums,
  enMessages,
  enSchemaMessages,
  esEnums,
  esMessages,
  esSchemaMessages,
  getLocalizedDashboardPresetMeta,
  getLocalizedDashboardWidgetMeta,
  getLocalizedEnumLabel,
  getLocalizedIntervalLabel,
  getLocalizedSpaceRoleLabel,
  getLocalizedStatusLabel,
  getLocalizedWorkflowRunStatusLabel,
  getMessages,
  normalizeUserLocale,
  resolveUILanguage,
  translate,
  translateSchemaKey,
  type I18nDashboardWidgetId,
} from "./index"

const WIDGET_IDS: readonly I18nDashboardWidgetId[] = [
  "ai_quick_ask",
  "net_worth",
  "budget_pace",
  "upcoming_bills",
  "today_schedule",
  "priority_mail",
  "workflow_runs",
]

describe("@saturn/i18n", () => {
  it("exposes supported UI locales", () => {
    const values = SUPPORTED_UI_LOCALES.map((l) => l.value)
    expect(values).toContain("en-US")
    expect(values).toContain("es-ES")
    expect(values).toContain("es-419")
  })

  it.each([
    { input: undefined, expected: "en" },
    { input: null, expected: "en" },
    { input: "", expected: "en" },
    { input: "en", expected: "en" },
    { input: "en-US", expected: "en" },
    { input: "fr-FR", expected: "en" },
    { input: "es", expected: "es" },
    { input: "es-ES", expected: "es" },
    { input: "es-DO", expected: "es" },
    { input: "es-419", expected: "es" },
    { input: "es_MX", expected: "es" },
    { input: "ES-ar", expected: "es" },
  ])("resolveUILanguage($input) -> $expected", ({ input, expected }) => {
    expect(resolveUILanguage(input)).toBe(expected)
  })

  it.each([
    { input: undefined, expected: "en-US" },
    { input: null, expected: "en-US" },
    { input: "", expected: "en-US" },
    { input: "en-US", expected: "en-US" },
    { input: "es-ES", expected: "es-ES" },
    { input: "es-419", expected: "es-419" },
    { input: "es_DO", expected: "es-DO" },
    { input: "not_a_locale$$", expected: "en-US" },
  ])("normalizeUserLocale($input) -> $expected", ({ input, expected }) => {
    expect(normalizeUserLocale(input)).toBe(expected)
  })

  it("structures locales/{en,es}.json as nested domain objects with zero dots at root and 100% leaf key parity", () => {
    for (const [label, root] of [
      ["en.json", enLocaleJson],
      ["es.json", esLocaleJson],
    ] as const) {
      const rootKeys = Object.keys(root)
      expect(rootKeys.length).toBeGreaterThan(0)
      for (const key of rootKeys) {
        expect(
          key,
          `${label} root key ${key} must not contain dots`
        ).not.toContain(".")
        const value = (root as Record<string, unknown>)[key]
        expect(
          typeof value === "object" && value !== null && !Array.isArray(value),
          `${label} root key ${key} must be a nested object`
        ).toBe(true)
      }
    }

    expect(Object.keys(esLocaleJson).sort()).toEqual(
      Object.keys(enLocaleJson).sort()
    )

    const enKeys = Object.keys(enMessages).sort()
    const esKeys = Object.keys(esMessages).sort()
    expect(esKeys).toEqual(enKeys)

    for (const key of enKeys) {
      const k = key as keyof typeof enMessages
      expect(enMessages[k].trim().length).toBeGreaterThan(0)
      expect(esMessages[k].trim().length).toBeGreaterThan(0)
    }
  })

  it("maintains 100% nested domain -> enumGroup -> key parity between enums/{en,es}.json", () => {
    const enDomains = Object.keys(enEnums).sort()
    const esDomains = Object.keys(esEnums).sort()
    expect(esDomains).toEqual(enDomains)

    for (const domain of enDomains) {
      const enGroups = Object.keys(
        enEnums[domain as keyof typeof enEnums]
      ).sort()
      const esGroups = Object.keys(
        esEnums[domain as keyof typeof esEnums]
      ).sort()
      expect(esGroups).toEqual(enGroups)

      for (const group of enGroups) {
        const enGroupDict = (
          enEnums[domain as keyof typeof enEnums] as Record<
            string,
            Record<string, string>
          >
        )[group]
        const esGroupDict = (
          esEnums[domain as keyof typeof esEnums] as Record<
            string,
            Record<string, string>
          >
        )[group]
        const enKeys = Object.keys(enGroupDict).sort()
        const esKeys = Object.keys(esGroupDict).sort()
        expect(esKeys).toEqual(enKeys)

        for (const key of enKeys) {
          expect(enGroupDict[key].trim().length).toBeGreaterThan(0)
          expect(esGroupDict[key].trim().length).toBeGreaterThan(0)
        }
      }
    }
  })

  it("structures schemas/{en,es}.json as domain-nested semantic keys with zero dots or sentences in keys and 100% leaf key parity", () => {
    for (const [label, root] of [
      ["schemas/en.json", enSchemaJson],
      ["schemas/es.json", esSchemaJson],
    ] as const) {
      const rootDomains = Object.keys(root)
      expect(rootDomains.length).toBeGreaterThan(0)
      for (const domain of rootDomains) {
        expect(
          domain,
          `${label} domain ${domain} must not contain dots`
        ).not.toContain(".")
        expect(
          domain,
          `${label} domain ${domain} must not contain spaces`
        ).not.toContain(" ")
        const domainObj = (root as Record<string, unknown>)[domain]
        expect(
          typeof domainObj === "object" &&
            domainObj !== null &&
            !Array.isArray(domainObj),
          `${label} domain ${domain} must be a nested object`
        ).toBe(true)
        for (const [leafKey, leafVal] of Object.entries(
          domainObj as Record<string, unknown>
        )) {
          expect(
            leafKey,
            `${label} ${domain}.${leafKey} must not contain dots`
          ).not.toContain(".")
          expect(
            leafKey,
            `${label} ${domain}.${leafKey} must be a semantic camelCase key`
          ).toMatch(/^[a-z][a-zA-Z0-9]*$/)
          expect(typeof leafVal).toBe("string")
        }
      }
    }

    expect(Object.keys(esSchemaJson).sort()).toEqual(
      Object.keys(enSchemaJson).sort()
    )

    const enKeys = Object.keys(enSchemaMessages).sort()
    const esKeys = Object.keys(esSchemaMessages).sort()
    expect(esKeys).toEqual(enKeys)
    for (const key of enKeys) {
      const k = key as keyof typeof enSchemaMessages
      expect(enSchemaMessages[k].trim().length).toBeGreaterThan(0)
      expect(esSchemaMessages[k].trim().length).toBeGreaterThan(0)
    }
  })

  it("translates keys and interpolates parameters in English and Spanish", () => {
    expect(getMessages("en-US")).toBe(enMessages)
    expect(getMessages("es-ES")).toBe(esMessages)

    expect(translate("en-US", "nav.transactions")).toBe("Transactions")
    expect(translate("es-ES", "nav.transactions")).toBe("Transacciones")
    expect(translate("es-419", "common.save")).toBe("Guardar")

    expect(
      translate("en-US", "dashboard.pendingInboxItems", { count: 4 })
    ).toBe("4 pending inbox items")
    expect(
      translate("es-ES", "dashboard.pendingInboxItems", { count: 4 })
    ).toBe("4 elementos pendientes en la cola")

    expect(translate("es-DO", "space.switchedTo", { name: "Hogar" })).toBe(
      "Cambiado a Hogar"
    )
    expect(
      translate("en-US", "commandPalette.switchLanguage", {
        language: "Español",
      })
    ).toBe("Switch Language to Español")
  })

  it("localizes domain-keyed enums and normalizes legacy protobuf prefixes", () => {
    expect(getLocalizedStatusLabel("ACTIVE")).toBe("Active")
    expect(getLocalizedStatusLabel("ACTIVE", "es-ES")).toBe("Activo")
    expect(
      getLocalizedStatusLabel("RECURRING_TRANSACTION_STATUS_ACTIVE", "es-ES")
    ).toBe("Activo")
    expect(getLocalizedStatusLabel("STATUS_PAUSED", "es-ES")).toBe("Pausado")
    expect(getLocalizedStatusLabel("STATUS_UNSPECIFIED", "en-US")).toBe(
      "Active"
    )
    expect(getLocalizedStatusLabel("PENDING", "en-US")).toBe("Pending")
    expect(getLocalizedStatusLabel("PENDING", "es-ES")).toBe("Pendiente")
    expect(getLocalizedStatusLabel("PAID", "en-US")).toBe("Paid")
    expect(getLocalizedStatusLabel("PAID", "es-419")).toBe("Pagado")
    expect(getLocalizedStatusLabel("SKIPPED", "en-US")).toBe("Skipped")
    expect(getLocalizedStatusLabel("SKIPPED", "es-ES")).toBe("Omitido")
    expect(getLocalizedStatusLabel("CUSTOM_STATE", "es-ES")).toBe(
      "Custom state"
    )

    expect(getLocalizedIntervalLabel("DAILY", "en-US")).toBe("Daily")
    expect(getLocalizedIntervalLabel("DAILY", "es-ES")).toBe("Diario")
    expect(getLocalizedIntervalLabel("INTERVAL_WEEKLY", "es-ES")).toBe(
      "Semanal"
    )
    expect(
      getLocalizedIntervalLabel("RECURRENCE_INTERVAL_UNSPECIFIED", "es-ES")
    ).toBe("Mensual")
    expect(getLocalizedIntervalLabel("BIWEEKLY", "en-US")).toBe("Biweekly")
    expect(getLocalizedIntervalLabel("BIWEEKLY", "es-ES")).toBe("Quincenal")
    expect(getLocalizedIntervalLabel("MONTHLY", "es-ES")).toBe("Mensual")
    expect(getLocalizedIntervalLabel("YEARLY", "es-ES")).toBe("Anual")

    expect(
      getLocalizedEnumLabel("finance", "transactionType", "EXPENSE", "es-ES")
    ).toBe("Gasto")
    expect(
      getLocalizedEnumLabel("finance", "accountType", "CREDIT_CARD", "es-ES")
    ).toBe("Tarjeta de crédito")
    expect(getLocalizedSpaceRoleLabel("OWNER", "en-US")).toBe("Owner")
    expect(getLocalizedSpaceRoleLabel("SPACE_ROLE_ADMIN", "es-ES")).toBe(
      "Administrador"
    )
    expect(getLocalizedWorkflowRunStatusLabel("running", "en-US")).toBe(
      "Running"
    )
    expect(getLocalizedWorkflowRunStatusLabel("FAILED", "es-ES")).toBe(
      "Fallido"
    )
    expect(getLocalizedWorkflowRunStatusLabel("succeeded", "es-ES")).toBe(
      "Exitoso"
    )
  })

  it("localizes all dashboard widgets and presets", () => {
    for (const id of WIDGET_IDS) {
      const enMeta = getLocalizedDashboardWidgetMeta(id, "en-US")
      const esMeta = getLocalizedDashboardWidgetMeta(id, "es-ES")
      expect(enMeta.id).toBe(id)
      expect(esMeta.id).toBe(id)
      expect(enMeta.title).toBeTruthy()
      expect(esMeta.title).toBeTruthy()
      expect(enMeta.description).toBeTruthy()
      expect(esMeta.description).toBeTruthy()
      expect(enMeta.empty).toBeTruthy()
      expect(esMeta.empty).toBeTruthy()
    }

    for (const presetId of ["default", "finance", "comms", "automation"]) {
      const enPreset = getLocalizedDashboardPresetMeta(presetId, "en-US")
      const esPreset = getLocalizedDashboardPresetMeta(presetId, "es-ES")
      expect(enPreset.label).toBeTruthy()
      expect(esPreset.label).toBeTruthy()
      expect(enPreset.description).toBeTruthy()
      expect(esPreset.description).toBeTruthy()
    }

    expect(getLocalizedDashboardPresetMeta("balanced", "es-ES").label).toBe(
      "Equilibrado"
    )
    expect(
      getLocalizedDashboardPresetMeta("finance_first", "es-ES").label
    ).toBe("Finanzas primero")
    expect(getLocalizedDashboardPresetMeta("daily_ops", "es-ES").label).toBe(
      "Operación diaria"
    )
    expect(getLocalizedDashboardPresetMeta("minimal", "es-ES").label).toBe(
      "Minimalista"
    )
  })

  it("translates typed schema keys with parameter interpolation in English and Spanish", () => {
    expect(translateSchemaKey("en-US", "auth.passwordRequired")).toBe(
      "Password is required"
    )
    expect(translateSchemaKey("es-ES", "auth.passwordRequired")).toBe(
      "La contraseña es obligatoria"
    )
    expect(
      translateSchemaKey("en-US", "ai.apiKeyRequired", { driver: "gemini" })
    ).toBe("API key is required for gemini")
    expect(
      translateSchemaKey("es-ES", "ai.apiKeyRequired", { driver: "gemini" })
    ).toBe("La clave API es obligatoria para gemini")
    expect(
      translateSchemaKey("es-ES", "workflow.duplicateSwitchCase", {
        name: "vip",
      })
    ).toBe('Nombre de caso switch duplicado "vip"')
    expect(
      translateSchemaKey("es-419", "workflow.duplicateStepId", { id: "step_1" })
    ).toBe('ID de paso duplicado "step_1"')
    expect(
      translateSchemaKey("es-ES", "workflow.duplicateField", { name: "email" })
    ).toBe('Campo duplicado "email"')
    expect(translateSchemaKey("en-US", "ai.maxAttachments", { max: 5 })).toBe(
      "At most 5 attachments allowed per message"
    )
    expect(translateSchemaKey("es-ES", "ai.maxAttachments", { max: 5 })).toBe(
      "Se permiten como máximo 5 archivos adjuntos por mensaje"
    )
  })

  it("translates mail keys and parameter interpolation in English and Spanish", () => {
    expect(translate("en-US", "mail.compose")).toBe("Compose")
    expect(translate("es-ES", "mail.compose")).toBe("Redactar")
    expect(translate("en-US", "mail.bucket.inbox")).toBe("Inbox")
    expect(translate("es-ES", "mail.bucket.inbox")).toBe("Bandeja de entrada")
    expect(translate("es-ES", "mail.bucket.trash")).toBe("Papelera")
    expect(translate("en-US", "mail.conversationsArchived", { count: 3 })).toBe(
      "3 conversations archived"
    )
    expect(translate("es-ES", "mail.conversationsArchived", { count: 3 })).toBe(
      "3 conversaciones archivadas"
    )
    expect(
      translate("en-US", "mail.stageFinance.stagedDescription", {
        vendor: "Stripe",
      })
    ).toBe("Stripe queued for review.")
    expect(
      translate("es-ES", "mail.stageFinance.stagedDescription", {
        vendor: "Stripe",
      })
    ).toBe("Stripe en cola para revisión.")
  })
})
