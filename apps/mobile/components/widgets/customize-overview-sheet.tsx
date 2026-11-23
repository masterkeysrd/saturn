import React, { useEffect, useMemo, useRef } from "react"
import { View, Text, TouchableOpacity, Switch, StyleSheet } from "react-native"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarClock,
  Landmark,
  Mail,
  PiggyBank,
  RotateCcw,
  Sparkles,
  Workflow,
} from "lucide-react-native"
import {
  DASHBOARD_PRESETS,
  DEFAULT_DASHBOARD_WIDGETS,
  type DashboardWidgetId,
} from "@saturn/core"
import {
  getLocalizedDashboardPresetMeta,
  getLocalizedDashboardWidgetMeta,
} from "@saturn/i18n"
import { useI18n } from "@saturn/hooks"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"
import {
  applyDashboardPreset,
  findActiveDashboardPresetId,
  getOrderedDashboardRows,
  moveDashboardWidget,
  toggleDashboardWidget,
} from "../../lib/overview-preferences"
import { AppBottomSheet } from "../ui/bottom-sheet"
import { Button } from "../ui/button"

const WIDGET_ICONS: Record<DashboardWidgetId, typeof Sparkles> = {
  ai_quick_ask: Sparkles,
  net_worth: Landmark,
  budget_pace: PiggyBank,
  upcoming_bills: CalendarClock,
  today_schedule: Calendar,
  priority_mail: Mail,
  workflow_runs: Workflow,
}

export interface CustomizeOverviewSheetProps {
  open: boolean
  activeWidgets: DashboardWidgetId[]
  isSaving?: boolean
  onClose: () => void
  onChangeWidgets: (nextWidgets: DashboardWidgetId[]) => void
}

export function CustomizeOverviewSheet({
  open,
  activeWidgets,
  isSaving = false,
  onClose,
  onChangeWidgets,
}: CustomizeOverviewSheetProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const insets = useSafeAreaInsets()
  const { t, locale } = useI18n()
  const sheetRef = useRef<BottomSheet>(null)

  useEffect(() => {
    if (open) {
      sheetRef.current?.expand()
    } else {
      sheetRef.current?.close()
    }
  }, [open])

  const orderedRows = useMemo(
    () => getOrderedDashboardRows(activeWidgets),
    [activeWidgets]
  )

  const activePresetId = useMemo(
    () => findActiveDashboardPresetId(activeWidgets),
    [activeWidgets]
  )

  return (
    <AppBottomSheet
      ref={sheetRef}
      title={t("dashboard.customizeTitle")}
      snapPoints={["80%"]}
      onClose={onClose}
    >
      <View style={styles.root}>
        <BottomSheetScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Presets Row */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t("dashboard.presets")}</Text>
              {isSaving ? (
                <Text style={styles.savingHint}>{t("common.saving")}</Text>
              ) : null}
            </View>
            <Text style={styles.sectionSubtitle}>
              {t("dashboard.customizeDescription")}
            </Text>

            <View style={styles.presetsGrid}>
              {DASHBOARD_PRESETS.map((preset) => {
                const isSelected = activePresetId === preset.id
                const localizedPreset = getLocalizedDashboardPresetMeta(
                  preset.id,
                  locale
                )
                return (
                  <TouchableOpacity
                    key={preset.id}
                    activeOpacity={0.75}
                    onPress={() => {
                      haptics.selection()
                      onChangeWidgets(applyDashboardPreset(preset.id))
                    }}
                    style={[
                      styles.presetCard,
                      isSelected && styles.presetCardActive,
                    ]}
                    testID={`overview-preset-${preset.id}`}
                  >
                    <Text
                      style={[
                        styles.presetLabel,
                        isSelected && styles.presetLabelActive,
                      ]}
                    >
                      {localizedPreset.label}
                    </Text>
                    <Text style={styles.presetDesc} numberOfLines={2}>
                      {localizedPreset.description}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Widgets & Order List */}
          <View style={[styles.section, styles.sectionDivider]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t("dashboard.widgets")}</Text>
              <Text style={styles.activeCountText}>
                {activeWidgets.length} {t("common.active").toLowerCase()}
              </Text>
            </View>
            <Text style={styles.sectionSubtitle}>
              {t("dashboard.customizeSyncDesc")}
            </Text>

            <View style={styles.widgetsList}>
              {orderedRows.map((row, idx) => {
                const WidgetIcon = WIDGET_ICONS[row.id]
                const localizedWidget = getLocalizedDashboardWidgetMeta(
                  row.id,
                  locale
                )
                const isLastEnabled = row.enabled && activeWidgets.length <= 1
                const canMoveUp = row.enabled && row.activeIndex > 0
                const canMoveDown =
                  row.enabled && row.activeIndex < activeWidgets.length - 1

                return (
                  <View
                    key={row.id}
                    style={[
                      styles.widgetRow,
                      idx < orderedRows.length - 1 && styles.widgetRowBorder,
                    ]}
                    testID={`overview-widget-row-${row.id}`}
                  >
                    <View style={styles.widgetInfoCol}>
                      <View style={styles.widgetTitleRow}>
                        <WidgetIcon
                          size={15}
                          color={
                            row.enabled ? colors.primary : colors.textMuted
                          }
                        />
                        <Text
                          style={[
                            styles.widgetTitle,
                            !row.enabled && styles.widgetTitleMuted,
                          ]}
                          numberOfLines={1}
                        >
                          {localizedWidget.title}
                        </Text>
                      </View>
                      <Text style={styles.widgetDesc} numberOfLines={2}>
                        {localizedWidget.description}
                      </Text>
                    </View>

                    <View style={styles.widgetControls}>
                      {row.enabled && (
                        <View style={styles.reorderBtns}>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            disabled={!canMoveUp}
                            onPress={() => {
                              haptics.selection()
                              onChangeWidgets(
                                moveDashboardWidget(activeWidgets, row.id, "up")
                              )
                            }}
                            style={[
                              styles.reorderBtn,
                              !canMoveUp && styles.reorderBtnDisabled,
                            ]}
                            testID={`overview-widget-up-${row.id}`}
                            accessibilityLabel={`Move ${row.title} up`}
                          >
                            <ArrowUp size={14} color={colors.textPrimary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            disabled={!canMoveDown}
                            onPress={() => {
                              haptics.selection()
                              onChangeWidgets(
                                moveDashboardWidget(
                                  activeWidgets,
                                  row.id,
                                  "down"
                                )
                              )
                            }}
                            style={[
                              styles.reorderBtn,
                              !canMoveDown && styles.reorderBtnDisabled,
                            ]}
                            testID={`overview-widget-down-${row.id}`}
                            accessibilityLabel={`Move ${row.title} down`}
                          >
                            <ArrowDown size={14} color={colors.textPrimary} />
                          </TouchableOpacity>
                        </View>
                      )}

                      <Switch
                        value={row.enabled}
                        disabled={isLastEnabled}
                        onValueChange={(nextVal) => {
                          haptics.selection()
                          onChangeWidgets(
                            toggleDashboardWidget(
                              activeWidgets,
                              row.id,
                              nextVal
                            )
                          )
                        }}
                        trackColor={{
                          false: colors.surfaceHighlight,
                          true: colors.primary,
                        }}
                        testID={`overview-widget-switch-${row.id}`}
                        accessibilityLabel={`Toggle ${row.title}`}
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        </BottomSheetScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 14) },
          ]}
        >
          <Button
            variant="secondary"
            size="md"
            leftIcon={<RotateCcw size={15} color={colors.textPrimary} />}
            onPress={() => {
              haptics.medium()
              onChangeWidgets([...DEFAULT_DASHBOARD_WIDGETS])
            }}
            style={styles.resetBtn}
            testID="overview-reset-default-btn"
          >
            {t("common.reset")}
          </Button>
          <Button
            variant="primary"
            size="md"
            onPress={() => {
              haptics.light()
              onClose()
            }}
            style={styles.doneBtn}
            testID="overview-customize-done-btn"
          >
            {t("common.done")}
          </Button>
        </View>
      </View>
    </AppBottomSheet>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  root: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionDivider: {
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  sectionHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: t.colors.textMuted,
    lineHeight: 17,
  },
  savingHint: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.primary,
  },
  activeCountText: {
    fontSize: 12,
    fontWeight: "600" as const,
    fontFamily: t.typography.mono,
    color: t.colors.textMuted,
  },
  presetsGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 4,
  },
  presetCard: {
    width: "48%" as const,
    flexGrow: 1,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    padding: 10,
    gap: 3,
  },
  presetCardActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  presetLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  presetLabelActive: {
    color: t.colors.primary,
  },
  presetDesc: {
    fontSize: 11,
    color: t.colors.textMuted,
    lineHeight: 15,
  },
  widgetsList: {
    marginTop: 2,
  },
  widgetRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 10,
    paddingVertical: 11,
  },
  widgetRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  widgetInfoCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  widgetTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 7,
  },
  widgetTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flexShrink: 1,
  },
  widgetTitleMuted: {
    color: t.colors.textMuted,
  },
  widgetDesc: {
    fontSize: 12,
    color: t.colors.textMuted,
    lineHeight: 16,
  },
  widgetControls: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flexShrink: 0,
  },
  reorderBtns: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  reorderBtn: {
    width: 28,
    height: 28,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  reorderBtnDisabled: {
    opacity: 0.35,
  },
  footer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  resetBtn: {
    flex: 1,
  },
  doneBtn: {
    flex: 1,
  },
})
