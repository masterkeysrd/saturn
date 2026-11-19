import { describe, it, expect } from "vitest"
import {
  DASHBOARD_PRESETS,
  DASHBOARD_WIDGET_CATALOG,
  DASHBOARD_WIDGET_IDS,
  DASHBOARD_WIDGET_MAP,
  DEFAULT_DASHBOARD_WIDGETS,
  isDashboardWidgetId,
  normalizeDashboardWidgets,
} from "./catalog"

describe("dashboard catalog", () => {
  it("keeps catalog aligned with canonical widget IDs", () => {
    expect(DASHBOARD_WIDGET_CATALOG).toHaveLength(DASHBOARD_WIDGET_IDS.length)
    expect(DASHBOARD_WIDGET_CATALOG.map((w) => w.id)).toEqual([
      ...DASHBOARD_WIDGET_IDS,
    ])
    for (const id of DASHBOARD_WIDGET_IDS) {
      expect(DASHBOARD_WIDGET_MAP[id]).toBeDefined()
      expect(DASHBOARD_WIDGET_MAP[id].id).toBe(id)
    }
  })

  it("ensures every preset contains only valid unique widget IDs", () => {
    expect(DASHBOARD_PRESETS).toHaveLength(4)
    for (const preset of DASHBOARD_PRESETS) {
      expect(preset.widgets.length).toBeGreaterThan(0)
      const unique = new Set(preset.widgets)
      expect(unique.size).toBe(preset.widgets.length)
      for (const id of preset.widgets) {
        expect(isDashboardWidgetId(id)).toBe(true)
      }
    }
  })

  it("normalizes widget lists by filtering unknown IDs, deduplicating, and falling back to defaults", () => {
    expect(normalizeDashboardWidgets(undefined)).toEqual([
      ...DEFAULT_DASHBOARD_WIDGETS,
    ])
    expect(normalizeDashboardWidgets(null)).toEqual([
      ...DEFAULT_DASHBOARD_WIDGETS,
    ])
    expect(normalizeDashboardWidgets([])).toEqual([
      ...DEFAULT_DASHBOARD_WIDGETS,
    ])
    expect(normalizeDashboardWidgets(["unknown_1", "unknown_2"])).toEqual([
      ...DEFAULT_DASHBOARD_WIDGETS,
    ])

    expect(
      normalizeDashboardWidgets([
        "net_worth",
        "invalid_widget",
        "triage",
        "budget_pace",
        "net_worth",
        "workflow_runs",
      ])
    ).toEqual(["net_worth", "budget_pace", "workflow_runs"])
  })
})
