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

  it("translates calendar keys and parameter interpolation in English and Spanish", () => {
    expect(translate("en-US", "calendar.agenda")).toBe("Agenda")
    expect(translate("es-ES", "calendar.agenda")).toBe("Agenda")
    expect(translate("en-US", "calendar.day")).toBe("Day")
    expect(translate("es-ES", "calendar.day")).toBe("Día")
    expect(translate("en-US", "calendar.week")).toBe("Week")
    expect(translate("es-ES", "calendar.week")).toBe("Semana")
    expect(translate("en-US", "calendar.month")).toBe("Month")
    expect(translate("es-ES", "calendar.month")).toBe("Mes")
    expect(translate("en-US", "calendar.threeDay")).toBe("3-Day")
    expect(translate("es-ES", "calendar.threeDay")).toBe("3 Días")
    expect(translate("en-US", "calendar.createEvent")).toBe("Create Event")
    expect(translate("es-ES", "calendar.createEvent")).toBe("Crear evento")
    expect(translate("en-US", "calendar.createCalendarEvent")).toBe(
      "Create Calendar Event"
    )
    expect(translate("es-ES", "calendar.createCalendarEvent")).toBe(
      "Crear evento"
    )
    expect(translate("en-US", "calendar.allDay")).toBe("All day")
    expect(translate("es-ES", "calendar.allDay")).toBe("Todo el día")
    expect(translate("en-US", "calendar.allDayEvent")).toBe("All-day event")
    expect(translate("es-ES", "calendar.allDayEvent")).toBe("Todo el día")
    expect(translate("en-US", "calendar.deleteEvent")).toBe("Delete Event")
    expect(translate("es-ES", "calendar.deleteEvent")).toBe("Eliminar evento")
    expect(
      translate("en-US", "calendar.deleteEventConfirm", {
        title: "Product Review",
      })
    ).toBe(
      "Are you sure you want to delete Product Review? This action cannot be undone."
    )
    expect(
      translate("es-ES", "calendar.deleteEventConfirm", {
        title: "Revisión de producto",
      })
    ).toBe(
      "¿Estás seguro de que deseas eliminar Revisión de producto? Esta acción no se puede deshacer."
    )
    expect(translate("en-US", "calendar.moreBills", { count: 3 })).toBe(
      "+3 bills"
    )
    expect(translate("es-ES", "calendar.moreBills", { count: 3 })).toBe(
      "+3 facturas"
    )
    expect(translate("en-US", "calendar.moreEvents", { count: 5 })).toBe(
      "+5 more"
    )
    expect(translate("es-ES", "calendar.moreEvents", { count: 5 })).toBe(
      "+5 más"
    )
  })

  it("translates finance insights keys and chart labels in English and Spanish", () => {
    expect(translate("en-US", "finance.insights.title")).toBe("Insights")
    expect(translate("es-ES", "finance.insights.title")).toBe("Análisis")
    expect(translate("en-US", "finance.insights.cashFlow")).toBe("Cash Flow")
    expect(translate("es-ES", "finance.insights.cashFlow")).toBe(
      "Flujo de caja"
    )
    expect(translate("en-US", "finance.insights.outflows")).toBe("Outflows")
    expect(translate("es-ES", "finance.insights.outflows")).toBe("Gastos")
    expect(translate("en-US", "finance.insights.inflows")).toBe("Inflows")
    expect(translate("es-ES", "finance.insights.inflows")).toBe("Ingresos")
    expect(translate("en-US", "finance.insights.totalSpent")).toBe(
      "Total Spent"
    )
    expect(translate("es-ES", "finance.insights.totalSpent")).toBe(
      "Gasto total"
    )
    expect(translate("en-US", "finance.insights.netSavings")).toBe(
      "Net Savings"
    )
    expect(translate("es-ES", "finance.insights.netSavings")).toBe(
      "Ahorro neto"
    )
    expect(
      translate("en-US", "finance.insights.chart.stackedBarAria", {
        label: "Apr 2026",
        total: "$1,200",
      })
    ).toBe("Apr 2026: Total $1,200. Press Enter to inspect transactions.")
    expect(
      translate("es-ES", "finance.insights.chart.stackedBarAria", {
        label: "Abr 2026",
        total: "1.200 €",
      })
    ).toBe(
      "Abr 2026: Total 1.200 €. Presiona Enter para inspeccionar transacciones."
    )
  })

  it("translates finance transactions keys in English and Spanish", () => {
    expect(translate("en-US", "finance.transactions.title")).toBe(
      "Transactions"
    )
    expect(translate("es-ES", "finance.transactions.title")).toBe(
      "Transacciones"
    )
    expect(translate("en-US", "finance.transactions.recordTransaction")).toBe(
      "Record Transaction"
    )
    expect(translate("es-ES", "finance.transactions.recordTransaction")).toBe(
      "Registrar transacción"
    )
    expect(
      getLocalizedEnumLabel("finance", "transactionType", "EXPENSE", "en-US")
    ).toBe("Expense")
    expect(
      getLocalizedEnumLabel("finance", "transactionType", "EXPENSE", "es-ES")
    ).toBe("Gasto")
    expect(
      translate("en-US", "finance.transactions.stagedForReview", { count: 3 })
    ).toBe("3 staged for review")
    expect(
      translate("es-ES", "finance.transactions.stagedForReview", { count: 3 })
    ).toBe("3 en espera de revisión")
    expect(translate("en-US", "finance.transactions.inspector.title")).toBe(
      "Transaction Details"
    )
    expect(translate("es-ES", "finance.transactions.inspector.title")).toBe(
      "Detalles de la transacción"
    )
    expect(translate("en-US", "finance.transactions.scheduled.title")).toBe(
      "Confirm Scheduled Bill/Income"
    )
    expect(translate("es-ES", "finance.transactions.scheduled.title")).toBe(
      "Confirmar factura / ingreso programado"
    )
    expect(
      translate("en-US", "finance.transactions.scheduled.dueOn", {
        date: "Apr 20",
      })
    ).toBe("Due Apr 20")
    expect(
      translate("es-ES", "finance.transactions.scheduled.dueOn", {
        date: "20 abr",
      })
    ).toBe("Vence 20 abr")
    expect(translate("en-US", "finance.pickers.account.noAccount")).toBe(
      "No Account (Off-ledger / Cash)"
    )
    expect(translate("es-ES", "finance.pickers.account.noAccount")).toBe(
      "Sin cuenta (Fuera de balance / Efectivo)"
    )
    expect(translate("en-US", "finance.pickers.budget.none")).toBe(
      "None / Uncategorized"
    )
    expect(translate("es-ES", "finance.pickers.budget.none")).toBe(
      "Ninguno / Sin categorizar"
    )
    expect(
      translate("en-US", "finance.transactions.borrowing.selectTitle")
    ).toBe("Select Borrowing Agreement")
    expect(
      translate("es-ES", "finance.transactions.borrowing.selectTitle")
    ).toBe("Seleccionar acuerdo de préstamo")
    expect(
      translate("en-US", "finance.transactions.borrowing.formDescription", {
        counterparty: "Alice",
      })
    ).toBe("Record a payment or disbursement linked to Alice.")
    expect(
      translate("es-ES", "finance.transactions.borrowing.formDescription", {
        counterparty: "Alice",
      })
    ).toBe("Registra un pago o desembolso vinculado a Alice.")
    expect(translate("en-US", "finance.inbox.title")).toBe(
      "Reconciliation Queue"
    )
    expect(translate("es-ES", "finance.inbox.title")).toBe(
      "Bandeja de revisión"
    )
    expect(translate("en-US", "finance.inbox.noItemsPending")).toBe(
      "No items pending review"
    )
    expect(translate("es-ES", "finance.inbox.noItemsPending")).toBe(
      "No hay elementos pendientes de revisión"
    )
    expect(
      translate("en-US", "finance.inbox.stagedItemsWithCount", { count: 5 })
    ).toBe("Staged Items (5)")
    expect(
      translate("es-ES", "finance.inbox.stagedItemsWithCount", { count: 5 })
    ).toBe("Elementos en cola (5)")
  })

  it("translates finance accounts keys in English and Spanish", () => {
    expect(translate("en-US", "finance.accounts.title")).toBe(
      "Accounts & Cash Flow"
    )
    expect(translate("es-ES", "finance.accounts.title")).toBe(
      "Cuentas y flujo de caja"
    )
    expect(translate("en-US", "finance.accounts.addAccount")).toBe(
      "Add Account"
    )
    expect(translate("es-ES", "finance.accounts.addAccount")).toBe(
      "Añadir cuenta"
    )
    expect(
      translate("en-US", "finance.accounts.tabAccountsWithCount", { count: 4 })
    ).toBe("Accounts (4)")
    expect(
      translate("es-ES", "finance.accounts.tabTransfersWithCount", { count: 2 })
    ).toBe("Transferencias (2)")
    expect(
      translate("en-US", "finance.accounts.deleteSuccessDescription", {
        name: "Chase Checking",
      })
    ).toBe('Account "Chase Checking" has been deleted.')
    expect(
      translate("es-ES", "finance.accounts.deleteSuccessDescription", {
        name: "Cuenta Popular",
      })
    ).toBe('La cuenta "Cuenta Popular" ha sido eliminada.')
    expect(translate("en-US", "finance.accounts.sheet.createTitle")).toBe(
      "Create Account"
    )
    expect(translate("es-ES", "finance.accounts.sheet.editTitle")).toBe(
      "Editar cuenta"
    )
    expect(translate("en-US", "finance.accounts.card.balanceOwed")).toBe(
      "Balance Owed"
    )
    expect(translate("es-ES", "finance.accounts.card.balanceOwed")).toBe(
      "Saldo pendiente"
    )
    expect(
      translate("en-US", "finance.accounts.adjust.adjustmentIncome", {
        amount: "12.50",
        currency: "USD",
      })
    ).toBe("+12.50 USD (Income)")
    expect(
      translate("es-ES", "finance.accounts.adjust.adjustmentExpense", {
        amount: "3,75",
        currency: "EUR",
      })
    ).toBe("-3,75 EUR (Gasto)")
    expect(
      translate("en-US", "finance.accounts.history.description", {
        name: "N26",
      })
    ).toBe("Ledger for N26")
    expect(
      translate("es-ES", "finance.accounts.history.description", {
        name: "N26",
      })
    ).toBe("Libro de N26")
    expect(
      translate("en-US", "finance.accounts.transfer.multiCurrencyDescription", {
        source: "USD",
        destination: "EUR",
      })
    ).toBe(
      "Funds will be converted from USD to EUR using your rates configuration."
    )
    expect(
      translate("es-ES", "finance.accounts.transfer.multiCurrencyDescription", {
        source: "USD",
        destination: "EUR",
      })
    ).toBe(
      "Los fondos se convertirán de USD a EUR según tu configuración de tasas."
    )
    expect(
      translate("en-US", "finance.accounts.institution.createOption", {
        name: "Revolut",
      })
    ).toBe('Create "Revolut"')
    expect(
      translate("es-ES", "finance.accounts.institution.createOption", {
        name: "Revolut",
      })
    ).toBe('Crear "Revolut"')

    expect(
      getLocalizedEnumLabel(
        "finance",
        "accountType",
        "DIGITAL_ACCOUNT",
        "en-US"
      )
    ).toBe("Digital Wallet")
    expect(
      getLocalizedEnumLabel(
        "finance",
        "accountType",
        "DIGITAL_ACCOUNT",
        "es-ES"
      )
    ).toBe("Monedero digital")
    expect(
      getLocalizedEnumLabel("finance", "accountType", "BANK", "en-US")
    ).toBe("Bank / Checking")
    expect(
      getLocalizedEnumLabel("finance", "accountType", "BANK", "es-ES")
    ).toBe("Banco / Cuenta corriente")
    expect(
      getLocalizedEnumLabel("finance", "accountType", "CREDIT_CARD", "es-419")
    ).toBe("Tarjeta de crédito")
  })

  it("translates finance budgets keys in English and Spanish", () => {
    expect(translate("en-US", "finance.budgets.title")).toBe("Budgeting")
    expect(translate("es-ES", "finance.budgets.title")).toBe("Planificación")
    expect(translate("es-ES", "finance.budgets.createTemplate")).toBe(
      "Crear plantilla de presupuesto"
    )

    expect(
      translate("en-US", "finance.budgets.deletedDescription", {
        name: "Groceries",
      })
    ).toBe('Budget template "Groceries" has been deleted.')
    expect(
      translate("es-ES", "finance.budgets.deletedDescription", {
        name: "Comida",
      })
    ).toBe('La plantilla de presupuesto "Comida" ha sido eliminada.')

    expect(
      translate("en-US", "finance.budgets.aheadOfPace", { count: 3 })
    ).toBe("3 ahead of pace")
    expect(translate("es-ES", "finance.budgets.activeTemplatesCountOne")).toBe(
      "1 plantilla activa"
    )

    expect(
      translate("en-US", "finance.budgets.statusChangedTitle", {
        action: "Paused",
      })
    ).toBe("Budget Paused")
    expect(
      translate("es-ES", "finance.budgets.statusChangedDescription", {
        name: "Viajes",
        status: "pausado",
      })
    ).toBe('El presupuesto "Viajes" ahora está pausado.')

    expect(translate("en-US", "finance.budgets.paceTick", { pct: 42 })).toBe(
      "Today · 42% elapsed"
    )
    expect(translate("es-ES", "finance.budgets.paceTick", { pct: 42 })).toBe(
      "Hoy · 42% transcurrido"
    )

    expect(translate("en-US", "finance.budgets.icons.piggyBank")).toBe(
      "General"
    )
    expect(translate("es-ES", "finance.budgets.icons.shoppingCart")).toBe(
      "Alimentación"
    )

    expect(
      translate("en-US", "finance.budgets.progress.rateMissingDescription", {
        from: "USD",
        to: "EUR",
      })
    ).toBe(
      "No conversion rate configured from USD to EUR. Configure a rate to track this budget."
    )
    expect(
      translate("es-ES", "finance.budgets.progress.onPace", {
        detail: "Quedan 5 d",
      })
    ).toBe("A buen ritmo · Quedan 5 d")

    expect(translate("en-US", "finance.budgets.sheet.pausedLong")).toBe(
      "Paused (Temporarily Suspended)"
    )
    expect(
      getLocalizedEnumLabel(
        "finance",
        "limitPropagation",
        "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY",
        "es-ES"
      )
    ).toBe("Solo períodos futuros")
    expect(
      translate("en-US", "finance.budgets.sheet.ratePreview", {
        from: "USD",
        rate: 0.92,
        to: "EUR",
      })
    ).toBe("(at 1 USD = 0.92 EUR)")

    expect(
      translate("es-ES", "finance.budgets.history.description", {
        name: "Restaurantes",
      })
    ).toBe("Libro mayor de Restaurantes")

    expect(getLocalizedIntervalLabel("WEEKLY", "es-ES")).toBe("Semanal")
    expect(getLocalizedIntervalLabel("ONE_TIME", "en-US")).toBe("One-Time")
    expect(
      translate("es-ES", "finance.budgets.statusChangedTitle", {
        action: translate("es-ES", "finance.budgets.actionReopened"),
      })
    ).toBe("Presupuesto Reabierta")
  })

  it("translates finance recurring keys in English and Spanish", () => {
    expect(translate("en-US", "finance.recurring.title")).toBe(
      "Recurring Transactions"
    )
    expect(translate("es-ES", "finance.recurring.title")).toBe(
      "Transacciones recurrentes"
    )
    expect(translate("es-ES", "finance.recurring.createTemplate")).toBe(
      "Crear plantilla"
    )
    expect(translate("en-US", "finance.recurring.tabTemplates")).toBe(
      "Templates & Schedule"
    )
    expect(translate("es-ES", "finance.recurring.tabHistory")).toBe("Historial")

    expect(translate("en-US", "finance.recurring.total", { count: 4 })).toBe(
      "4 Total"
    )
    expect(
      translate("es-ES", "finance.recurring.pendingCount", { count: 2 })
    ).toBe("2 pendientes")
    expect(
      translate("en-US", "finance.recurring.graceBadge", { days: 3 })
    ).toBe("Grace: 3d")

    expect(
      translate("es-ES", "finance.recurring.delete.descriptionExpense", {
        name: "Alquiler",
      })
    ).toContain("Alquiler")
    expect(
      translate("en-US", "finance.recurring.delete.deletedIncomeDescription", {
        name: "Salary",
      })
    ).toBe('Recurring income template "Salary" has been deleted.')

    expect(translate("en-US", "finance.recurring.sheet.createTitle")).toBe(
      "Create Recurring Transaction"
    )
    expect(translate("es-ES", "finance.recurring.sheet.editTitle")).toBe(
      "Editar transacción recurrente"
    )
    expect(translate("es-ES", "finance.recurring.sheet.variableLabel")).toBe(
      "Transacción de importe variable"
    )

    expect(
      translate("en-US", "finance.recurring.history.description", {
        name: "Netflix",
      })
    ).toBe("Past cleared instances for Netflix")
    expect(translate("es-ES", "finance.recurring.history.clearedDate")).toBe(
      "Fecha de pago"
    )

    expect(
      translate("es-ES", "finance.recurring.skip.descriptionWithAmount", {
        name: "Netflix",
        amount: "15.49",
        currency: "EUR",
      })
    ).toContain("15.49 EUR")

    expect(translate("en-US", "finance.recurring.confirm.clearedTitle")).toBe(
      "Transaction Cleared!"
    )
    expect(translate("es-ES", "finance.recurring.confirm.linkAndClear")).toBe(
      "Vincular y registrar"
    )

    expect(translate("en-US", "finance.conversion.rateRequired")).toBe(
      "Exchange rate required"
    )
    expect(translate("es-ES", "finance.conversion.reportingEquivalent")).toBe(
      "Equivalente en la moneda de presentación"
    )
    expect(
      translate("en-US", "finance.conversion.configureRate", {
        tab: "Exchange Rates",
      })
    ).toBe(
      "Go to the Exchange Rates tab to configure this conversion rate before saving."
    )

    expect(
      getLocalizedEnumLabel(
        "finance",
        "sourceType",
        "SOURCE_TYPE_UNSPECIFIED",
        "es-ES"
      )
    ).toBe("Pago programado")
    expect(
      getLocalizedEnumLabel("finance", "sourceType", "LOAN", "en-US")
    ).toBe("Loan")
    expect(getLocalizedEnumLabel("finance", "sourceType", "TAX", "es-ES")).toBe(
      "Impuesto"
    )
    expect(
      getLocalizedEnumLabel("finance", "status", "STATUS_ENDED", "es-ES")
    ).toBe("Finalizado")
  })

  it("translates finance borrowing keys in English and Spanish", () => {
    expect(translate("en-US", "finance.borrowing.recordBorrowing")).toBe(
      "Record Borrowing"
    )
    expect(translate("es-ES", "finance.borrowing.recordBorrowing")).toBe(
      "Registrar préstamo"
    )

    expect(translate("es-ES", "finance.borrowing.sheet.directionLent")).toBe(
      "Prestado (alguien me debe)"
    )
    expect(translate("en-US", "finance.borrowing.detail.logInstallment")).toBe(
      "Log Installment Payment"
    )

    expect(
      translate("en-US", "finance.borrowing.delete.description", {
        name: "Ana",
      })
    ).toContain("with Ana?")
    expect(
      translate("es-ES", "finance.borrowing.delete.description", {
        name: "Ana",
      })
    ).toContain("con Ana?")

    expect(
      translate("en-US", "finance.borrowing.detail.repaymentHistory", {
        count: 3,
      })
    ).toBe("Repayment History (3)")
    expect(
      translate("es-ES", "finance.borrowing.detail.repaymentHistory", {
        count: 3,
      })
    ).toBe("Historial de pagos (3)")

    expect(
      translate("en-US", "finance.borrowing.adjust.balanceIncrease", {
        delta: "10.00",
        currency: "USD",
      })
    ).toBe("+10.00 USD (Balance Increase)")
    expect(
      translate("es-ES", "finance.borrowing.adjust.noChange", {
        currency: "EUR",
      })
    ).toBe("0.00 EUR (Sin cambio)")
    expect(translate("es-ES", "finance.borrowing.adjust.invalidTarget")).toBe(
      "Introduce un saldo objetivo válido no negativo"
    )
  })

  it("translates finance reconcile keys in English and Spanish", () => {
    expect(translate("en-US", "finance.reconcile.title")).toBe(
      "Bank Statement Reconciliation"
    )
    expect(translate("es-ES", "finance.reconcile.title")).toBe(
      "Conciliaci\u00f3n de extractos bancarios"
    )
    expect(translate("es-ES", "finance.reconcile.importStatement")).toBe(
      "Importar extracto"
    )

    expect(
      translate("en-US", "finance.reconcile.dashboard.tabInProgress", {
        count: 2,
      })
    ).toBe("In Progress (2)")
    expect(
      translate("es-ES", "finance.reconcile.dashboard.tabInProgress", {
        count: 2,
      })
    ).toBe("En curso (2)")

    expect(
      translate("es-ES", "finance.reconcile.workspace.progressCount", {
        reviewed: 4,
        total: 10,
        percent: 40,
      })
    ).toBe("4 de 10 (40%)")

    expect(
      translate("en-US", "finance.reconcile.workspace.matchesApprovedOne", {
        count: 1,
      })
    ).toBe("Approved 1 exact transaction match.")
    expect(
      translate("es-ES", "finance.reconcile.workspace.matchesApprovedOther", {
        count: 3,
      })
    ).toBe("Se han aprobado 3 coincidencias exactas de transacci\u00f3n.")

    expect(
      translate("es-ES", "finance.reconcile.import.multiDescription", {
        count: 2,
      })
    ).toContain("2 libros por divisa")
    expect(
      translate("en-US", "finance.reconcile.import.colOption", { index: 3 })
    ).toBe("Col 3")
    expect(
      translate("es-ES", "finance.reconcile.import.rowsParsed", { count: 12 })
    ).toBe("12 filas analizadas en total")
  })

  it("translates finance exchange rates keys in English and Spanish", () => {
    expect(translate("en-US", "finance.exchangeRates.title")).toBe(
      "Exchange Rates"
    )
    expect(translate("es-ES", "finance.exchangeRates.title")).toBe(
      "Tasas de cambio"
    )
    expect(translate("es-ES", "finance.exchangeRates.addRate")).toBe(
      "A\u00f1adir tasa de conversi\u00f3n"
    )

    expect(
      translate("en-US", "finance.exchangeRates.reportingIntro", {
        currency: "USD",
      })
    ).toContain("Workspace Base Reporting Currency: USD.")
    expect(
      translate("es-ES", "finance.exchangeRates.reportingIntro", {
        currency: "EUR",
      })
    ).toContain("Moneda base de presentaci\u00f3n del espacio: EUR.")

    expect(
      translate("en-US", "finance.exchangeRates.deletedDescription", {
        from: "EUR",
        to: "USD",
      })
    ).toBe("Removed EUR to USD conversion rate.")
    expect(
      translate("es-ES", "finance.exchangeRates.perCurrency", {
        currency: "DOP",
      })
    ).toBe("Por 1 DOP")

    expect(
      translate("en-US", "finance.exchangeRates.sheet.directOption", {
        from: "EUR",
        to: "USD",
      })
    ).toBe("1 EUR = ? USD (Direct)")
    expect(
      translate("es-ES", "finance.exchangeRates.sheet.rateInverse", {
        from: "EUR",
        to: "USD",
      })
    ).toBe("Tasa (valor de 1 USD en EUR)")
    expect(translate("en-US", "common.to")).toBe("to")
    expect(translate("es-ES", "common.to")).toBe("a")
  })

  it("localizes copilot prompts and attach labels in English and Spanish", () => {
    expect(translate("en-US", "finance.recurring.copilotTitle")).toBe(
      "Recurring Transactions"
    )
    expect(translate("es-ES", "finance.recurring.copilotTitle")).toBe(
      "Transacciones recurrentes"
    )
    expect(translate("es-ES", "finance.recurring.suggestion.upcoming")).toBe(
      "Resume los pagos programados de este mes"
    )

    expect(translate("en-US", "finance.borrowing.copilotTitle")).toBe(
      "Personal Borrowing"
    )
    expect(
      translate("en-US", "finance.borrowing.suggestion.balances")
    ).toContain("what people owe me")
    expect(translate("es-ES", "finance.borrowing.suggestion.priorities")).toBe(
      "\u00bfQu\u00e9 deuda deber\u00eda priorizar al pagar?"
    )

    expect(translate("es-ES", "finance.reconcile.copilotTitle")).toBe(
      "Conciliaci\u00f3n de extractos bancarios"
    )
    expect(
      translate("en-US", "finance.reconcile.suggestion.discrepancies")
    ).toBe("Explain the discrepancies in this statement")

    expect(translate("en-US", "finance.exchangeRates.copilotTitle")).toBe(
      "Exchange Rates"
    )
    expect(
      translate("es-ES", "finance.exchangeRates.suggestion.missingRates")
    ).toContain("tasa de cambio de hoy?")

    expect(translate("es-ES", "finance.accounts.copilotTitle")).toBe("Cuentas")
    expect(translate("es-ES", "finance.budgets.copilotTitle")).toBe(
      "Presupuestos"
    )

    expect(translate("en-US", "copilot.addTo")).toBe("Add to Copilot")
    expect(translate("es-ES", "copilot.attachTo", { name: "Groceries" })).toBe(
      "A\u00f1adir Groceries a Copilot"
    )
    expect(translate("en-US", "copilot.pinnedTo")).toBe("Pinned to Copilot")
  })

  it("translates workflows keys and enums in English and Spanish", () => {
    expect(translate("en-US", "workflows.title")).toBe("Workflows Studio")
    expect(translate("es-ES", "workflows.title")).toBe(
      "Estudio de flujos de trabajo"
    )

    expect(translate("en-US", "workflows.canvas.endOfFlow")).toBe("End of Flow")
    expect(translate("es-ES", "workflows.canvas.endOfFlow")).toBe(
      "Fin del flujo"
    )

    expect(
      translate("en-US", "workflows.runs.stepTimeline", { count: 1 })
    ).toBe("Step Timeline (1)")
    expect(translate("es-ES", "workflows.preset.weeklyMonday")).toBe(
      "Semanal los lunes"
    )
    expect(translate("es-ES", "workflows.editor.guard.discard")).toBe(
      "Descartar cambios"
    )
    expect(
      translate("es-ES", "workflows.runs.explainPrompt", {
        id: "wfr_1",
        name: "Receipts",
        error: "boom",
      })
    ).toContain("wfr_1")

    expect(getLocalizedEnumLabel("workflow", "stepType", "filter", "en")).toBe(
      "Filter"
    )
    expect(getLocalizedEnumLabel("workflow", "stepType", "filter", "es")).toBe(
      "Filtro"
    )
    expect(
      getLocalizedEnumLabel("workflow", "triggerType", "webhook", "es")
    ).toBe("Webhook")
    expect(
      getLocalizedEnumLabel("workflow", "runStatus", "completed", "es")
    ).toBe("Completado")

    expect(
      translate("en-US", "workflows.cron.everyWeekdayAt", {
        weekday: "Monday",
        time: "09:00",
      })
    ).toBe("Every Monday at 09:00")
    expect(translate("es-ES", "workflows.cron.weekdays.monday")).toBe("lunes")
  })
})
