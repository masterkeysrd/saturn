import { describe, it, expect } from "vitest"
import {
  DASHBOARD_PRESETS,
  DASHBOARD_WIDGET_CATALOG,
  DEFAULT_DASHBOARD_WIDGETS,
  normalizeDashboardWidgets,
} from "@saturn/core"
import type { InboxItem } from "@saturn/api/saturn/finance/v1/finance"
import {
  buildUpdateInboxItemRequest,
  canQuickApproveInboxItem,
  decodeInboxRawPayload,
  getInboxDocTypeLabel,
  parseDecimalToCentsString,
  resolveInboxTransactionType,
} from "../lib/inbox-triage"
import {
  applyDashboardPreset,
  areDashboardWidgetListsEqual,
  buildUpdateDashboardPreferencesPayload,
  findActiveDashboardPresetId,
  getOrderedDashboardRows,
  moveDashboardWidget,
  toggleDashboardWidget,
} from "../lib/overview-preferences"

function makeInboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "inb_01",
    spaceId: "spc_01",
    status: "PENDING",
    docType: "RECEIPT",
    amount: "2450",
    currency: "USD",
    vendorName: "Blue Bottle Coffee",
    transactionDate: "2026-04-12",
    accountId: "acc_checking",
    budgetId: "bud_dining",
    scheduledTransactionId: "",
    transactionId: "",
    metadata: {
      transaction_type: "EXPENSE",
    },
    ...overrides,
  }
}

describe("Finance Inbox Triage Helpers", () => {
  describe("canQuickApproveInboxItem", () => {
    it("allows Expense with budgetId, positive amount, and vendorName", () => {
      expect(canQuickApproveInboxItem(makeInboxItem())).toBe(true)
    })

    it("requires budgetId for unlinked Expense items", () => {
      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            scheduledTransactionId: "",
            borrowingId: "",
          })
        )
      ).toBe(false)
    })

    it("allows Income without budgetId", () => {
      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            metadata: { transaction_type: "INCOME" },
          })
        )
      ).toBe(true)
    })

    it("allows Expense without budgetId when linked to a scheduled bill or borrowing", () => {
      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            scheduledTransactionId: "sch_123",
          })
        )
      ).toBe(true)

      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            borrowingId: "bor_456",
          })
        )
      ).toBe(true)
    })

    it("rejects zero/invalid amounts and empty vendor names", () => {
      expect(canQuickApproveInboxItem(makeInboxItem({ amount: "0" }))).toBe(
        false
      )
      expect(canQuickApproveInboxItem(makeInboxItem({ amount: "-100" }))).toBe(
        false
      )
      expect(
        canQuickApproveInboxItem(makeInboxItem({ vendorName: "   " }))
      ).toBe(false)
    })

    it("requires distinct source and destination accounts for Transfer items", () => {
      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            accountId: "acc_1",
            metadata: {
              transaction_type: "TRANSFER",
              destination_account_id: "acc_2",
            },
          })
        )
      ).toBe(true)

      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            accountId: "acc_1",
            metadata: {
              transaction_type: "TRANSFER",
            },
          })
        )
      ).toBe(false)

      expect(
        canQuickApproveInboxItem(
          makeInboxItem({
            budgetId: "",
            accountId: "acc_1",
            metadata: {
              transaction_type: "TRANSFER",
              destination_account_id: "acc_1",
            },
          })
        )
      ).toBe(false)
    })
  })

  describe("resolveInboxTransactionType & doc helpers", () => {
    it("defaults unknown transaction_type metadata to EXPENSE", () => {
      expect(resolveInboxTransactionType({ metadata: {} })).toBe("EXPENSE")
      expect(
        resolveInboxTransactionType({
          metadata: { transaction_type: "income" },
        })
      ).toBe("INCOME")
      expect(
        resolveInboxTransactionType({
          metadata: { transaction_type: "TRANSFER" },
        })
      ).toBe("TRANSFER")
    })

    it("maps docType enums to clean display labels", () => {
      expect(getInboxDocTypeLabel("RECEIPT")).toBe("Receipt")
      expect(getInboxDocTypeLabel("INVOICE")).toBe("Invoice")
      expect(getInboxDocTypeLabel("BANK_NOTIFICATION")).toBe("Bank Alert")
      expect(getInboxDocTypeLabel("UNKNOWN")).toBe("Document")
    })

    it("decodes base64 raw payloads and falls back safely for plain text", () => {
      const encoded = btoa("Card ending in 4242 charged $24.50")
      expect(decodeInboxRawPayload(encoded)).toBe(
        "Card ending in 4242 charged $24.50"
      )
      expect(decodeInboxRawPayload("Plain alert text")).toBe("Plain alert text")
      expect(decodeInboxRawPayload("")).toBe("")
    })

    it("converts decimal strings into rounded cents strings", () => {
      expect(parseDecimalToCentsString("24.50")).toBe("2450")
      expect(parseDecimalToCentsString("1,250.99")).toBe("125099")
      expect(parseDecimalToCentsString("", "900")).toBe("900")
    })
  })

  describe("buildUpdateInboxItemRequest", () => {
    it("builds UpdateInboxItemRequest with exact updateMask paths and merged metadata", () => {
      const base = makeInboxItem({
        metadata: {
          transaction_type: "EXPENSE",
          potential_duplicate_id: "txn_dup_9",
        },
      })

      const result = buildUpdateInboxItemRequest(base, {
        docType: "BANK_NOTIFICATION",
        transactionType: "TRANSFER",
        amount: "50000",
        currency: "EUR",
        vendorName: "Savings Transfer",
        accountId: "acc_src",
        destinationAccountId: "acc_dst",
        budgetId: "",
      })

      expect(result.id).toBe("inb_01")
      expect(result.req.id).toBe("inb_01")
      expect(result.req.updateMask?.paths).toEqual(
        expect.arrayContaining([
          "doc_type",
          "amount",
          "currency",
          "vendor_name",
          "account_id",
          "budget_id",
          "metadata",
        ])
      )
      expect(result.req.inboxItem.docType).toBe("BANK_NOTIFICATION")
      expect(result.req.inboxItem.amount).toBe("50000")
      expect(result.req.inboxItem.currency).toBe("EUR")
      expect(result.req.inboxItem.vendorName).toBe("Savings Transfer")
      expect(result.req.inboxItem.accountId).toBe("acc_src")
      expect(result.req.inboxItem.budgetId).toBe("")
      expect(result.req.inboxItem.metadata).toEqual({
        transaction_type: "TRANSFER",
        destination_account_id: "acc_dst",
        potential_duplicate_id: "txn_dup_9",
      })
    })
  })
})

describe("Overview Customization & Preferences State Transitions", () => {
  it("applies all presets cleanly and recognizes active preset IDs", () => {
    for (const preset of DASHBOARD_PRESETS) {
      const applied = applyDashboardPreset(preset.id)
      expect(applied).toEqual([...preset.widgets])
      expect(findActiveDashboardPresetId(applied)).toBe(preset.id)
    }

    const custom = moveDashboardWidget(
      applyDashboardPreset("finance"),
      "upcoming_bills",
      "up"
    )
    expect(findActiveDashboardPresetId(custom)).toBeNull()
  })

  it("toggles widgets on/off and prevents turning off the last remaining active widget", () => {
    const start = applyDashboardPreset("comms") // ["ai_quick_ask", "today_schedule", "priority_mail"]

    // Enable a disabled widget -> appended
    const withBudget = toggleDashboardWidget(start, "budget_pace", true)
    expect(withBudget).toEqual([
      "ai_quick_ask",
      "today_schedule",
      "priority_mail",
      "budget_pace",
    ])

    // Toggling an already enabled widget on is a no-op copy
    expect(toggleDashboardWidget(start, "today_schedule", true)).toEqual(start)

    // Remove down to 1 active widget
    const twoLeft = toggleDashboardWidget(start, "ai_quick_ask", false)
    const oneLeft = toggleDashboardWidget(twoLeft, "today_schedule", false)
    expect(oneLeft).toEqual(["priority_mail"])

    // Attempting to disable the last remaining widget is blocked
    const stillOne = toggleDashboardWidget(oneLeft, "priority_mail", false)
    expect(stillOne).toEqual(["priority_mail"])
  })

  it("reorders widgets up and down and respects list boundaries", () => {
    const start = applyDashboardPreset("default")
    // ["ai_quick_ask", "net_worth", "budget_pace", "today_schedule", "priority_mail"]

    const movedUp = moveDashboardWidget(start, "budget_pace", "up")
    expect(movedUp).toEqual([
      "ai_quick_ask",
      "budget_pace",
      "net_worth",
      "today_schedule",
      "priority_mail",
    ])

    const movedDown = moveDashboardWidget(movedUp, "ai_quick_ask", "down")
    expect(movedDown).toEqual([
      "budget_pace",
      "ai_quick_ask",
      "net_worth",
      "today_schedule",
      "priority_mail",
    ])

    // Boundary checks
    expect(moveDashboardWidget(start, "ai_quick_ask", "up")).toEqual(start)
    expect(moveDashboardWidget(start, "priority_mail", "down")).toEqual(start)
  })

  it("normalizes round-trips, orders active rows above disabled rows, and builds Space update payloads", () => {
    expect(normalizeDashboardWidgets(undefined)).toEqual([
      ...DEFAULT_DASHBOARD_WIDGETS,
    ])
    expect(normalizeDashboardWidgets([])).toEqual([
      ...DEFAULT_DASHBOARD_WIDGETS,
    ])
    expect(
      normalizeDashboardWidgets([
        "workflow_runs",
        "invalid_widget",
        "net_worth",
        "workflow_runs",
      ])
    ).toEqual(["workflow_runs", "net_worth"])

    const rows = getOrderedDashboardRows(["workflow_runs", "net_worth"])
    expect(rows).toHaveLength(DASHBOARD_WIDGET_CATALOG.length)
    expect(
      rows.slice(0, 2).map((r) => [r.id, r.enabled, r.activeIndex])
    ).toEqual([
      ["workflow_runs", true, 0],
      ["net_worth", true, 1],
    ])
    expect(rows.slice(2).every((r) => !r.enabled && r.activeIndex === -1)).toBe(
      true
    )

    expect(
      areDashboardWidgetListsEqual(
        ["workflow_runs", "net_worth"],
        ["workflow_runs", "net_worth"]
      )
    ).toBe(true)
    expect(
      areDashboardWidgetListsEqual(
        ["workflow_runs", "net_worth"],
        ["net_worth", "workflow_runs"]
      )
    ).toBe(false)

    const payload = buildUpdateDashboardPreferencesPayload(
      "spc_01XYZ",
      ["workflow_runs", "net_worth"],
      "4"
    )
    expect(payload).toEqual({
      space_id: "spc_01XYZ",
      req: {
        spaceId: "spc_01XYZ",
        dashboardPreferences: {
          widgets: ["workflow_runs", "net_worth"],
        },
        updateMask: { paths: ["widgets"] },
        version: "4",
      },
    })
  })
})
