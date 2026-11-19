import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react-native"
import {
  useTimezone,
  useI18n,
  useCalendars,
  useCalendarEvents,
  useEnsureDefaultCalendar,
  useConnectedAccounts,
  useSyncConnectedAccount,
} from "@saturn/hooks"
import {
  formatLocalDateString,
  getTimezoneParts,
  parseDate,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import { SpaceAvatarButton, AIHeaderButton } from "@/components/app-header"
import { QuickCaptureFab } from "@/components/ui/quick-capture-sheet"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  DateStrip,
  stepCalendarStripDate,
} from "@/components/calendar/date-strip"
import { TimelineGrid } from "@/components/calendar/timeline-grid"
import { AgendaList } from "@/components/calendar/agenda-list"
import { CalendarFilterSheet } from "@/components/calendar/calendar-filter-sheet"
import { EventPreviewSheet } from "@/components/calendar/event-preview-sheet"
import { getConsecutiveDays } from "@/components/calendar/calendar-utils"

export type MobileCalendarViewMode = "agenda" | "day" | "three_day"

export default function CalendarScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tz = useTimezone()
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { activeSpaceRole } = useSpace()
  const isViewer = activeSpaceRole === "viewer"

  // Active view mode: Agenda, 1-Day, 3-Day
  const [viewMode, setViewMode] = useState<MobileCalendarViewMode>("agenda")

  // Date strip expanded (month matrix) vs collapsed (week strip)
  const [isStripExpanded, setIsStripExpanded] = useState(false)

  // Current focal date
  const [currentDate, setCurrentDate] = useState<Date>(() => tz.now())

  // Selected occurrence for preview bottom sheet
  const [selectedOccurrence, setSelectedOccurrence] = useState<
    EventOccurrence | undefined
  >(undefined)

  // Bottom sheet references
  const filterSheetRef = useRef<BottomSheet>(null)
  const previewSheetRef = useRef<BottomSheet>(null)

  // Pull to refresh state
  const [refreshing, setRefreshing] = useState(false)

  // Calendars query
  const { data: calendarsData } = useCalendars()
  const calendars = useMemo(
    () => calendarsData?.calendars || [],
    [calendarsData]
  )

  // Ensure default calendar if workspace has none
  const ensureDefaultMutation = useEnsureDefaultCalendar()
  useEffect(() => {
    if (
      calendarsData &&
      calendarsData.calendars.length === 0 &&
      !ensureDefaultMutation.isPending &&
      !ensureDefaultMutation.isSuccess
    ) {
      ensureDefaultMutation.mutate({})
    }
  }, [calendarsData, ensureDefaultMutation])

  // Enabled calendars filter
  const enabledCalendarIds = useMemo(() => {
    return calendars.filter((c) => c.isEnabled).map((c) => c.id)
  }, [calendars])

  // Compute viewport range around active month
  const { rangeStart, rangeEnd } = useMemo(() => {
    const parts = getTimezoneParts(currentDate, tz.timezone)
    if (!parts) {
      const now = new Date()
      return {
        rangeStart: new Date(now.getTime() - 14 * 86400000).toISOString(),
        rangeEnd: new Date(now.getTime() + 60 * 86400000).toISOString(),
      }
    }
    const startNoon = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day - 20, 12, 0, 0)
    )
    const endNoon = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + 40, 12, 0, 0)
    )
    return {
      rangeStart: tz.startOfDay(startNoon).toISOString(),
      rangeEnd: tz.endOfDay(endNoon).toISOString(),
    }
  }, [currentDate, tz])

  // Query events
  const {
    data: eventsData,
    isLoading: eventsLoading,
    refetch: refetchEvents,
  } = useCalendarEvents(rangeStart, rangeEnd, enabledCalendarIds)

  const occurrences = useMemo(() => eventsData?.occurrences || [], [eventsData])

  // Set of dates that have occurrences (for DateStrip dots)
  const eventsByDate = useMemo(() => {
    const set = new Set<string>()
    for (const occ of occurrences) {
      if (occ.isAllDay && occ.startDate) {
        set.add(occ.startDate)
      } else if (occ.startTime) {
        const p = parseDate(occ.startTime)
        if (p) {
          const dStr = formatLocalDateString(p, tz.timezone)
          if (dStr) set.add(dStr)
        }
      }
    }
    return set
  }, [occurrences, tz.timezone])

  // Connected accounts sync hook
  const { data: connectedData } = useConnectedAccounts()
  const syncAccountMutation = useSyncConnectedAccount()

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    haptics.light()
    try {
      const calendarAccounts =
        connectedData?.accounts?.filter((acc) =>
          acc.enabledCapabilities?.some((c) =>
            c.toLowerCase().includes("calendar")
          )
        ) || []

      await Promise.allSettled(
        calendarAccounts
          .filter((acc) => Boolean(acc.id))
          .map((acc) => syncAccountMutation.mutateAsync({ id: acc.id! }))
      )
      await refetchEvents()
      haptics.success()
    } catch {
      haptics.error()
    } finally {
      setRefreshing(false)
    }
  }, [connectedData, syncAccountMutation, refetchEvents])

  // Mode switching
  const handleModeSwitch = (mode: MobileCalendarViewMode) => {
    haptics.selection()
    setViewMode(mode)
  }

  // Jump to Today
  const handleJumpToToday = () => {
    haptics.selection()
    setCurrentDate(tz.now())
  }

  // Toggle month matrix vs week strip
  const handleToggleStrip = () => {
    haptics.selection()
    setIsStripExpanded((prev) => !prev)
  }

  // Step week or month via compact ‹ / › buttons
  const handleStepDate = (direction: "prev" | "next") => {
    haptics.light()
    setCurrentDate((prev) =>
      stepCalendarStripDate(prev, tz.timezone, direction, isStripExpanded)
    )
  }

  // Open filter sheet
  const handleOpenFilters = () => {
    haptics.selection()
    filterSheetRef.current?.expand()
  }

  // Select occurrence to preview
  const handleSelectOccurrence = (occ: EventOccurrence) => {
    haptics.light()
    setSelectedOccurrence(occ)
    previewSheetRef.current?.expand()
  }

  // Open manage-event modal
  const handleOpenCreateEvent = (dateStr?: string, timeStr?: string) => {
    if (isViewer) return
    haptics.light()
    const targetDate =
      dateStr || formatLocalDateString(currentDate, tz.timezone)
    router.push({
      pathname: "/modal/manage-event",
      params: {
        initialDate: targetDate,
        initialStartTime: timeStr,
      },
    })
  }

  // Edit occurrence
  const handleEditOccurrence = (occ: EventOccurrence) => {
    previewSheetRef.current?.close()
    if (isViewer) return
    haptics.light()
    router.push({
      pathname: "/modal/manage-event",
      params: {
        eventId: occ.eventId,
        instanceId: occ.instanceId,
        occurrenceStartTime: occ.startTime ?? "",
        occurrenceStartDate: occ.startDate ?? "",
        occurrenceEndTime: occ.endTime ?? "",
        occurrenceEndDate: occ.endDate ?? "",
      },
    })
  }

  // Consecutive days for Day / 3-Day
  const timelineDays = useMemo(() => {
    if (viewMode === "day") {
      const dStr = formatLocalDateString(currentDate, tz.timezone)
      return dStr ? [dStr] : []
    }
    if (viewMode === "three_day") {
      return getConsecutiveDays(currentDate, 3, tz.timezone)
    }
    return []
  }, [viewMode, currentDate, tz.timezone])

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  )

  const activeMonthTitle = useMemo(() => {
    if (!currentDate) return ""

    if (currentDate.getFullYear() !== tz.now().getFullYear()) {
      return tz.format(currentDate, {
        month: "long",
        year: "numeric",
        day: undefined,
      })
    }

    return tz.format(currentDate, {
      month: "long",
      year: undefined,
      day: undefined,
    })
  }, [currentDate, tz])

  return (
    <View style={styles.container}>
      {/* Compact Safe-Area Calendar Header */}
      <View
        style={[styles.topBar, { paddingTop: Math.max(insets.top, 10) + 4 }]}
      >
        {/* Row 1: Interactive Month Title Toggle + Today + Filters + AI + Space Avatar */}
        <View style={styles.topHeaderRow}>
          <View style={styles.topLeftGroup}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleToggleStrip}
              style={styles.monthToggleButton}
              testID="calendar-strip-toggle"
              accessibilityRole="button"
              accessibilityState={{ expanded: isStripExpanded }}
              accessibilityLabel={`${activeMonthTitle}, ${isStripExpanded ? "collapse" : "expand"} month calendar`}
            >
              <Text style={styles.monthTitle} numberOfLines={1}>
                {activeMonthTitle}
              </Text>
              {isStripExpanded ? (
                <ChevronUp size={17} color={colors.textSecondary} />
              ) : (
                <ChevronDown size={17} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.topActionsRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleJumpToToday}
              style={styles.todayButton}
              testID="calendar-today-btn"
            >
              <RotateCcw size={13} color={colors.primary} />
              <Text style={styles.todayButtonText}>{t("common.today")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleOpenFilters}
              style={styles.filterButton}
              testID="calendar-filter-btn"
              accessibilityLabel="Calendar filters"
            >
              <SlidersHorizontal size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            <AIHeaderButton />
            <SpaceAvatarButton size={30} />
          </View>
        </View>

        {/* Row 2: View Mode Segmented Controls + Compact ‹ › Stepper */}
        <View style={styles.secondHeaderRow}>
          <View style={styles.segmentedControl} testID="calendar-mode-switcher">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleModeSwitch("agenda")}
              style={[
                styles.segmentBtn,
                viewMode === "agenda" && styles.segmentBtnActive,
              ]}
              testID="calendar-mode-agenda"
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  viewMode === "agenda" && styles.segmentBtnTextActive,
                ]}
              >
                Agenda
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleModeSwitch("day")}
              style={[
                styles.segmentBtn,
                viewMode === "day" && styles.segmentBtnActive,
              ]}
              testID="calendar-mode-day"
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  viewMode === "day" && styles.segmentBtnTextActive,
                ]}
              >
                Day
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleModeSwitch("three_day")}
              style={[
                styles.segmentBtn,
                viewMode === "three_day" && styles.segmentBtnActive,
              ]}
              testID="calendar-mode-3day"
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  viewMode === "three_day" && styles.segmentBtnTextActive,
                ]}
              >
                3-Day
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.stepperRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleStepDate("prev")}
              style={styles.stepperButton}
              testID="calendar-strip-prev"
              accessibilityRole="button"
              accessibilityLabel={
                isStripExpanded ? "Previous month" : "Previous week"
              }
            >
              <ChevronLeft size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleStepDate("next")}
              style={styles.stepperButton}
              testID="calendar-strip-next"
              accessibilityRole="button"
              accessibilityLabel={isStripExpanded ? "Next month" : "Next week"}
            >
              <ChevronRight size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Collapsible Date Strip (Synchronized with currentDate) */}
      <DateStrip
        selectedDate={currentDate}
        timeZone={tz.timezone}
        locale={tz.locale}
        weekStartsOn={tz.weekStartsOn}
        isExpanded={isStripExpanded}
        onSelectDate={setCurrentDate}
        eventsByDate={eventsByDate}
      />

      {/* Main View Area */}
      <View style={styles.viewContainer}>
        {eventsLoading && occurrences.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : viewMode === "agenda" ? (
          <AgendaList
            occurrences={occurrences}
            timeZone={tz.timezone}
            onSelectOccurrence={handleSelectOccurrence}
            onOpenCreate={() => handleOpenCreateEvent()}
            refreshControl={refreshControl}
            canCreate={!isViewer}
          />
        ) : (
          <TimelineGrid
            days={timelineDays}
            timeZone={tz.timezone}
            occurrences={occurrences}
            onSelectOccurrence={handleSelectOccurrence}
            onSelectSlot={(d, t) => handleOpenCreateEvent(d, t)}
            refreshControl={refreshControl}
          />
        )}
      </View>

      {/* Floating Action Button (FAB) to create event, hidden for viewer */}
      {!isViewer && (
        <QuickCaptureFab
          testID="calendar-fab-add"
          accessibilityLabel="New calendar event"
          accessibilityHint="Tap to create an event, or long press to jump to today"
          onPress={() => handleOpenCreateEvent()}
          onLongPress={handleJumpToToday}
        />
      )}

      {/* Calendar Filters Bottom Sheet */}
      <CalendarFilterSheet ref={filterSheetRef} canManage={!isViewer} />

      {/* Event Details Preview Sheet */}
      <EventPreviewSheet
        ref={previewSheetRef}
        occurrence={selectedOccurrence}
        timeZone={tz.timezone}
        canEdit={!isViewer}
        onEdit={handleEditOccurrence}
        onClose={() => setSelectedOccurrence(undefined)}
      />
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  topBar: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  topHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  topLeftGroup: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  monthToggleButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingVertical: 2,
    maxWidth: "100%" as const,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  secondHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  segmentedControl: {
    flex: 1,
    flexDirection: "row" as const,
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  stepperRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: t.radius.xs,
  },
  segmentBtnActive: {
    backgroundColor: t.colors.primary,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  segmentBtnTextActive: {
    color: t.colors.primaryForeground,
  },
  topActionsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  todayButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.primarySubtle,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  filterButton: {
    padding: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  viewContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
})
