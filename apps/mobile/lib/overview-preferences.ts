import {
  DASHBOARD_PRESETS,
  DASHBOARD_WIDGET_CATALOG,
  DASHBOARD_WIDGET_MAP,
  DEFAULT_DASHBOARD_WIDGETS,
  normalizeDashboardWidgets,
  type DashboardPreset,
  type DashboardWidgetDefinition,
  type DashboardWidgetId,
} from "@saturn/core"
import type { UpdateDashboardPreferencesRequest } from "@saturn/api/saturn/space/v1/space"

export interface OrderedDashboardWidgetRow extends DashboardWidgetDefinition {
  enabled: boolean
  activeIndex: number
}

export function applyDashboardPreset(
  presetId: DashboardPreset["id"]
): DashboardWidgetId[] {
  const preset = DASHBOARD_PRESETS.find((p) => p.id === presetId)
  if (!preset) {
    return [...DEFAULT_DASHBOARD_WIDGETS]
  }
  return normalizeDashboardWidgets(preset.widgets)
}

export function toggleDashboardWidget(
  current: readonly DashboardWidgetId[],
  id: DashboardWidgetId,
  nextChecked: boolean
): DashboardWidgetId[] {
  if (nextChecked) {
    if (current.includes(id)) {
      return [...current]
    }
    return [...current, id]
  }
  if (current.length <= 1) {
    return [...current]
  }
  return current.filter((item) => item !== id)
}

export function moveDashboardWidget(
  current: readonly DashboardWidgetId[],
  id: DashboardWidgetId,
  direction: "up" | "down"
): DashboardWidgetId[] {
  const idx = current.indexOf(id)
  if (idx === -1) return [...current]
  const targetIdx = direction === "up" ? idx - 1 : idx + 1
  if (targetIdx < 0 || targetIdx >= current.length) return [...current]
  const next = [...current]
  const [moved] = next.splice(idx, 1)
  next.splice(targetIdx, 0, moved)
  return next
}

export function getOrderedDashboardRows(
  draftWidgets: readonly DashboardWidgetId[]
): OrderedDashboardWidgetRow[] {
  const normalized = normalizeDashboardWidgets(draftWidgets)
  const enabledSet = new Set(normalized)

  const enabled: OrderedDashboardWidgetRow[] = normalized.map((id, idx) => ({
    ...DASHBOARD_WIDGET_MAP[id],
    enabled: true,
    activeIndex: idx,
  }))

  const disabled: OrderedDashboardWidgetRow[] = DASHBOARD_WIDGET_CATALOG.filter(
    (w) => !enabledSet.has(w.id)
  ).map((w) => ({
    ...w,
    enabled: false,
    activeIndex: -1,
  }))

  return [...enabled, ...disabled]
}

export function findActiveDashboardPresetId(
  draftWidgets: readonly DashboardWidgetId[]
): DashboardPreset["id"] | null {
  for (const preset of DASHBOARD_PRESETS) {
    if (
      preset.widgets.length === draftWidgets.length &&
      preset.widgets.every((id, idx) => draftWidgets[idx] === id)
    ) {
      return preset.id
    }
  }
  return null
}

export function areDashboardWidgetListsEqual(
  a: readonly DashboardWidgetId[],
  b: readonly DashboardWidgetId[]
): boolean {
  if (a.length !== b.length) return false
  return a.every((id, idx) => id === b[idx])
}

export function buildUpdateDashboardPreferencesPayload(
  spaceId: string,
  widgets: readonly DashboardWidgetId[],
  version?: string
): { space_id: string; req: UpdateDashboardPreferencesRequest } {
  return {
    space_id: spaceId,
    req: {
      spaceId,
      dashboardPreferences: {
        widgets: normalizeDashboardWidgets(widgets),
      },
      updateMask: { paths: ["widgets"] },
      ...(version !== undefined ? { version } : {}),
    },
  }
}
