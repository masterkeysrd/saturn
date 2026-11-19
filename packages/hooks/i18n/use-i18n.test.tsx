import { afterEach, describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { getClientLocale, setClientLocale } from "@saturn/api"
import { SUPPORTED_UI_LOCALES } from "@saturn/i18n"
import {
  TransactionSchema,
  configureZodLocale,
  getActiveZodLocale,
} from "@saturn/schemas"
import { TimezoneProvider } from "../timezone/use-timezone"
import { useI18n } from "./use-i18n"

describe("@saturn/hooks useI18n", () => {
  afterEach(() => {
    setClientLocale(undefined)
    configureZodLocale("en-US")
  })

  it("translates keys and interpolates parameters in en-US and es-ES", () => {
    let currentLocale = "en-US"
    const { result, rerender } = renderHook(() => useI18n(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <TimezoneProvider timezone="UTC" locale={currentLocale}>
          {children}
        </TimezoneProvider>
      ),
    })

    expect(result.current.locale).toBe("en-US")
    expect(result.current.language).toBe("en")
    expect(result.current.supportedLocales).toBe(SUPPORTED_UI_LOCALES)
    expect(result.current.t("nav.transactions")).toBe("Transactions")
    expect(result.current.t("dashboard.pendingInboxItems", { count: 3 })).toBe(
      "3 pending inbox items"
    )
    expect(result.current.t("space.switchedTo", { name: "Personal" })).toBe(
      "Switched to Personal"
    )

    currentLocale = "es-ES"
    rerender()

    expect(result.current.locale).toBe("es-ES")
    expect(result.current.language).toBe("es")
    expect(result.current.t("nav.transactions")).toBe("Transacciones")
    expect(result.current.t("dashboard.pendingInboxItems", { count: 3 })).toBe(
      "3 elementos pendientes en la cola"
    )
    expect(result.current.t("space.switchedTo", { name: "Hogar" })).toBe(
      "Cambiado a Hogar"
    )
  })

  it("syncs setClientLocale and configureZodLocale when TimezoneProvider locale changes", () => {
    let currentLocale = "es-ES"
    const { rerender } = renderHook(() => useI18n(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <TimezoneProvider timezone="UTC" locale={currentLocale}>
          {children}
        </TimezoneProvider>
      ),
    })

    expect(getClientLocale()).toBe("es-ES")
    expect(getActiveZodLocale()).toBe("es-ES")

    const esParse = TransactionSchema.safeParse({
      description: "",
      amount: "10",
      currency: "USD",
      transactionDate: new Date(),
      hasCustomEffectiveDate: false,
      effectiveDate: new Date(),
      budgetId: "bgt_1",
    })
    expect(esParse.success).toBe(false)
    if (!esParse.success) {
      expect(esParse.error.issues.map((i) => i.message)).toContain(
        "La descripción es obligatoria"
      )
    }

    currentLocale = "en-US"
    rerender()

    expect(getClientLocale()).toBe("en-US")
    expect(getActiveZodLocale()).toBe("en-US")

    const enParse = TransactionSchema.safeParse({
      description: "",
      amount: "10",
      currency: "USD",
      transactionDate: new Date(),
      hasCustomEffectiveDate: false,
      effectiveDate: new Date(),
      budgetId: "bgt_1",
    })
    expect(enParse.success).toBe(false)
    if (!enParse.success) {
      expect(enParse.error.issues.map((i) => i.message)).toContain(
        "Description is required"
      )
    }
  })
})
