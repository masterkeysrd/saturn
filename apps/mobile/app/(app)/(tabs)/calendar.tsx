import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
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
  useDeleteEvent,
} from "@saturn/hooks"
import {
  formatLocalDateString,
  getTimezoneParts,
  isMailAccountReauthRequired,
  parseDate,
} from "@saturn/core"
import type {
  EventOccurrence,
  RecurrenceScope,
} from "@saturn/api/saturn/calendar/v1/calendar"
import {
  SpaceAvatarButton,
  AIHeaderButton,
} from "../../../components/app-header"
import { AppBottomSheet } from "../../../components/ui/bottom-sheet"
import { QuickCaptureFab } from "../../../components/ui/quick-capture-sheet"
import { useToast } from "../../../components/ui/toast"
import { useSpace } from "../../../lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../../lib/theme"
import { haptics } from "../../../lib/haptics"
import {
  DateStrip,
  stepCalendarStripDate,
} from "../../../components/calendar/date-strip"
import { TimelineGrid } from "../../../components/calendar/timeline-grid"
import { AgendaList } from "../../../components/calendar/agenda-list"
import { CalendarFilterSheet } from "../../../components/calendar/calendar-filter-sheet"
import { EventPreviewSheet } from "../../../components/calendar/event-preview-sheet"
import {
  buildDuplicateEventParams,
  getConsecutiveDays,
} from "../../../components/calendar/calendar-utils"

export type MobileCalendarViewMode = "agenda" | "day" | "three_day" | "month"

export function resolveMobileCalendarViewMode(
  pref?: string | null
): MobileCalendarViewMode {
  switch (pref) {
    case "agenda":
    case "day":
    case "three_day":
    case "month":
      return pref
    case "week":
      return "three_day"
    default:
      return "agenda"
  }
}

export default function CalendarScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tz = useTimezone()
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const toast = useToast()
  const { activeSpaceRole, calendarMobileView, updateCalendarPreferences } =
    useSpace()
  const isViewer = activeSpaceRole === "viewer"

  // Active view mode: Agenda, 1-Day, 3-Day, Month (persisted per user preferences)
  const [viewMode, setViewMode] = useState<MobileCalendarViewMode>(() =>
    resolveMobileCalendarViewMode(calendarMobileView)
  )

  useEffect(() => {
    setViewMode(resolveMobileCalendarViewMode(calendarMobileView))
  }, [calendarMobileView])

  // Date strip expanded (month matrix) vs collapsed (week strip)
  const [isStripExpanded, setIsStripExpanded] = useState(false)

  // Current focal date and transient Agenda scroll header date
  const [currentDate, setCurrentDate] = useState<Date>(() => tz.now())
  const [agendaVisibleDate, setAgendaVisibleDate] = useState<Date | null>(null)
  const [todayResetSeq, setTodayResetSeq] = useState(0)

  // Selected occurrence for preview bottom sheet & recurrence delete sheet
  const [selectedOccurrence, setSelectedOccurrence] = useState<
    EventOccurrence | undefined
  >(undefined)
  const [pendingDeleteOccurrence, setPendingDeleteOccurrence] = useState<
    EventOccurrence | undefined
  >(undefined)

  // Bottom sheet references
  const filterSheetRef = useRef<BottomSheet>(null)
  const previewSheetRef = useRef<BottomSheet>(null)
  const deleteScopeSheetRef = useRef<BottomSheet>(null)

  // Pull to refresh state
  const [refreshing, setRefreshing] = useState(false)

  // Calendars query & event deletion
  const { data: calendarsData } = useCalendars()
  const calendars = useMemo(
    () => calendarsData?.calendars || [],
    [calendarsData]
  )
  const deleteEventMutation = useDeleteEvent()

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

  // Compute viewport range around active month (widened for smooth Agenda cross-month scroll)
  const { rangeStart, rangeEnd } = useMemo(() => {
    const parts = getTimezoneParts(currentDate, tz.timezone)
    if (!parts) {
      const now = new Date()
      return {
        rangeStart: new Date(now.getTime() - 45 * 86400000).toISOString(),
        rangeEnd: new Date(now.getTime() + 75 * 86400000).toISOString(),
      }
    }
    const startNoon = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day - 45, 12, 0, 0)
    )
    const endNoon = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + 75, 12, 0, 0)
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

  const hasCalendarReauthWarning = useMemo(() => {
    return (connectedData?.accounts || []).some((acc) => {
      const isCalCapable =
        !acc.enabledCapabilities ||
        acc.enabledCapabilities.length === 0 ||
        acc.enabledCapabilities.some((c) =>
          c.toLowerCase().includes("calendar")
        )
      return isCalCapable && isMailAccountReauthRequired(acc)
    })
  }, [connectedData?.accounts])

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

  // Mode switching (persisted to user preferences)
  const handleModeSwitch = (mode: MobileCalendarViewMode) => {
    haptics.selection()
    setViewMode(mode)
    setAgendaVisibleDate(null)
    void updateCalendarPreferences({ mobileView: mode }).catch(() => {})
  }

  // Select date from DateStrip
  const handleSelectDate = (date: Date) => {
    setAgendaVisibleDate(null)
    setCurrentDate(date)
  }

  // Jump to Today
  const handleJumpToToday = () => {
    haptics.selection()
    setAgendaVisibleDate(null)
    setCurrentDate(tz.now())
    setTodayResetSeq((seq) => seq + 1)
  }

  // Toggle month matrix vs week strip
  const handleToggleStrip = () => {
    haptics.selection()
    setIsStripExpanded((prev) => !prev)
  }

  // Step week or month via compact ‹ / › buttons
  const handleStepDate = (direction: "prev" | "next") => {
    haptics.light()
    setAgendaVisibleDate(null)
    setCurrentDate((prev) =>
      stepCalendarStripDate(
        prev,
        tz.timezone,
        direction,
        isStripExpanded || viewMode === "month"
      )
    )
  }

  const handleAgendaVisibleDateChange = useCallback((dateString: string) => {
    const [y, m, d] = dateString.split("-").map(Number)
    if (!y || !m || !d) return
    setAgendaVisibleDate(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)))
  }, [])

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

  // Duplicate occurrence into a new unsaved event draft
  const handleDuplicateOccurrence = (occ: EventOccurrence) => {
    previewSheetRef.current?.close()
    if (isViewer) return
    haptics.light()
    const duplicateParams = buildDuplicateEventParams(
      occ,
      tz.timezone,
      currentDate
    )
    router.push({
      pathname: "/modal/manage-event",
      params: duplicateParams,
    })
  }

  const executeDeleteOccurrence = async (
    occ: EventOccurrence,
    scope: RecurrenceScope
  ) => {
    deleteScopeSheetRef.current?.close()
    previewSheetRef.current?.close()
    setPendingDeleteOccurrence(undefined)
    haptics.heavy()
    try {
      await deleteEventMutation.mutateAsync({
        id: occ.eventId,
        req: {
          id: occ.eventId,
          recurrenceScope: scope,
          targetStartTime: occ.isAllDay ? "" : occ.startTime || "",
          targetStartDate: occ.isAllDay ? occ.startDate || "" : "",
        },
      })
      setSelectedOccurrence(undefined)
      haptics.success()
      toast.show({
        type: "success",
        title: t("calendar.eventDeleted"),
      })
    } catch (err: unknown) {
      haptics.error()
      toast.show({
        type: "error",
        title: t("calendar.deleteFailed"),
        message:
          err instanceof Error
            ? err.message
            : t("calendar.couldNotDeleteEvent"),
      })
    }
  }

  // Delete occurrence (recurrence-aware)
  const handleDeleteOccurrence = (occ: EventOccurrence) => {
    if (isViewer) return
    const isRecurring = Boolean(occ.masterId || occ.isException)
    if (isRecurring) {
      previewSheetRef.current?.close()
      setPendingDeleteOccurrence(occ)
      deleteScopeSheetRef.current?.expand()
      return
    }

    Alert.alert(
      t("calendar.deleteEvent"),
      t("calendar.deleteEventSimpleConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () =>
            void executeDeleteOccurrence(occ, "RECURRENCE_SCOPE_UNSPECIFIED"),
        },
      ]
    )
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

  const selectedDateString = useMemo(
    () => formatLocalDateString(currentDate, tz.timezone),
    [currentDate, tz.timezone]
  )

  const selectedDayOccurrences = useMemo(() => {
    if (viewMode !== "month" || !selectedDateString) return []
    return occurrences.filter((occ) => {
      if (occ.isAllDay) {
        const sDate = occ.startDate || ""
        const eDate = occ.endDate || sDate
        if (eDate > sDate) {
          return selectedDateString >= sDate && selectedDateString < eDate
        }
        return selectedDateString === sDate
      }
      if (!occ.startTime) return false
      const p = parseDate(occ.startTime)
      return p
        ? formatLocalDateString(p, tz.timezone) === selectedDateString
        : false
    })
  }, [viewMode, occurrences, selectedDateString, tz.timezone])

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  )

  const headerFocalDate =
    viewMode === "agenda" && agendaVisibleDate ? agendaVisibleDate : currentDate

  const activeMonthTitle = useMemo(() => {
    if (!headerFocalDate) return ""

    if (headerFocalDate.getFullYear() !== tz.now().getFullYear()) {
      return tz.formatMonth(headerFocalDate)
    }

    return tz.formatMonth(headerFocalDate, {
      month: "long",
      year: undefined,
    })
  }, [headerFocalDate, tz])

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
              accessibilityLabel={
                isStripExpanded
                  ? t("calendar.collapseMonthCalendar", {
                      month: activeMonthTitle,
                    })
                  : t("calendar.expandMonthCalendar", {
                      month: activeMonthTitle,
                    })
              }
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
              accessibilityLabel={t("calendar.filters")}
            >
              <SlidersHorizontal size={16} color={colors.textSecondary} />
              {hasCalendarReauthWarning && (
                <View
                  testID="calendar-filter-reauth-dot"
                  style={styles.filterReauthDot}
                />
              )}
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
                {t("calendar.agenda")}
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
                {t("calendar.day")}
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
                numberOfLines={1}
                style={[
                  styles.segmentBtnText,
                  viewMode === "three_day" && styles.segmentBtnTextActive,
                ]}
              >
                {t("calendar.threeDay")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleModeSwitch("month")}
              style={[
                styles.segmentBtn,
                viewMode === "month" && styles.segmentBtnActive,
              ]}
              testID="calendar-mode-month"
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.segmentBtnText,
                  viewMode === "month" && styles.segmentBtnTextActive,
                ]}
              >
                {t("calendar.month")}
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
                isStripExpanded || viewMode === "month"
                  ? t("calendar.prevMonth")
                  : t("calendar.prevWeek")
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
              accessibilityLabel={
                isStripExpanded || viewMode === "month"
                  ? t("calendar.nextMonth")
                  : t("calendar.nextWeek")
              }
            >
              <ChevronRight size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Collapsible Date Strip (Always expanded in Month mode) */}
      <DateStrip
        selectedDate={currentDate}
        timeZone={tz.timezone}
        locale={tz.locale}
        weekStartsOn={tz.weekStartsOn}
        isExpanded={viewMode === "month" || isStripExpanded}
        onSelectDate={handleSelectDate}
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
            focusDate={selectedDateString}
            resetSeq={todayResetSeq}
            onSelectOccurrence={handleSelectOccurrence}
            onVisibleDateChange={handleAgendaVisibleDateChange}
            onOpenCreate={() => handleOpenCreateEvent()}
            refreshControl={refreshControl}
            canCreate={!isViewer}
          />
        ) : viewMode === "month" ? (
          <View style={styles.monthListContainer} testID="calendar-month-view">
            <AgendaList
              occurrences={selectedDayOccurrences}
              timeZone={tz.timezone}
              focusDate={selectedDateString}
              onSelectOccurrence={handleSelectOccurrence}
              onOpenCreate={() => handleOpenCreateEvent()}
              refreshControl={refreshControl}
              canCreate={!isViewer}
            />
          </View>
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
          accessibilityLabel={t("calendar.newEvent")}
          accessibilityHint={t("calendar.newEventHint")}
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
        onDuplicate={handleDuplicateOccurrence}
        onDelete={handleDeleteOccurrence}
        onClose={() => setSelectedOccurrence(undefined)}
      />

      {/* Recurring Event Delete Scope Sheet */}
      <AppBottomSheet
        ref={deleteScopeSheetRef}
        title={t("calendar.deleteEvent")}
        snapPoints={["42%"]}
        onClose={() => setPendingDeleteOccurrence(undefined)}
      >
        <View style={styles.scopeContainer}>
          <Text style={styles.scopePromptText}>
            {t("calendar.recurringDeletePrompt")}
          </Text>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (pendingDeleteOccurrence) {
                void executeDeleteOccurrence(
                  pendingDeleteOccurrence,
                  "RECURRENCE_SCOPE_THIS_EVENT"
                )
              }
            }}
            style={styles.scopeButton}
            testID="calendar-delete-scope-this"
          >
            <Text style={styles.scopeButtonText}>
              {t("calendar.thisEventOnly")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (pendingDeleteOccurrence) {
                void executeDeleteOccurrence(
                  pendingDeleteOccurrence,
                  "RECURRENCE_SCOPE_THIS_AND_FOLLOWING"
                )
              }
            }}
            style={styles.scopeButton}
            testID="calendar-delete-scope-following"
          >
            <Text style={styles.scopeButtonText}>
              {t("calendar.thisAndFollowingEvents")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (pendingDeleteOccurrence) {
                void executeDeleteOccurrence(
                  pendingDeleteOccurrence,
                  "RECURRENCE_SCOPE_ALL_EVENTS"
                )
              }
            }}
            style={[styles.scopeButton, styles.scopeButtonDestructive]}
            testID="calendar-delete-scope-all"
          >
            <Text style={styles.scopeButtonDestructiveText}>
              {t("calendar.allEventsInSeries")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              deleteScopeSheetRef.current?.close()
              setPendingDeleteOccurrence(undefined)
            }}
            style={styles.scopeCancelButton}
            testID="calendar-delete-scope-cancel"
          >
            <Text style={styles.scopeCancelButtonText}>
              {t("common.cancel")}
            </Text>
          </TouchableOpacity>
        </View>
      </AppBottomSheet>
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
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: t.radius.xs,
  },
  segmentBtnActive: {
    backgroundColor: t.colors.primary,
  },
  segmentBtnText: {
    fontSize: 11.5,
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
    position: "relative" as const,
    padding: 6,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  filterReauthDot: {
    position: "absolute" as const,
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.colors.warning,
  },
  viewContainer: {
    flex: 1,
  },
  monthListContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  scopeContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },
  scopePromptText: {
    fontSize: 14,
    color: t.colors.textSecondary,
    marginBottom: 4,
  },
  scopeButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  scopeButtonDestructive: {
    borderColor: t.colors.destructive,
    backgroundColor: t.colors.destructiveSubtle,
  },
  scopeButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  scopeButtonDestructiveText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.destructive,
  },
  scopeCancelButton: {
    paddingVertical: 11,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.md,
  },
  scopeCancelButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
})
