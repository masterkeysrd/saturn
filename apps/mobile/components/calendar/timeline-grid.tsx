import { useMemo, useRef, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  type RefreshControlProps,
} from "react-native"
import {
  getHourSlots,
  computeTimedEventLayout,
  formatLocalDateString,
  getTimezoneParts,
  parseDate,
  type HourSlot,
} from "@saturn/core"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { formatEventTime } from "./calendar-utils"

const HOUR_HEIGHT = 60
const TOTAL_GRID_HEIGHT = 24 * HOUR_HEIGHT
const TIME_COL_WIDTH = 54

export interface TimelineGridProps {
  days: string[] // Array of "YYYY-MM-DD"
  timeZone: string
  occurrences: EventOccurrence[]
  onSelectOccurrence: (occ: EventOccurrence) => void
  onSelectSlot?: (dateStr: string, timeStr: string) => void
  refreshControl?: React.ReactElement<RefreshControlProps>
}

export function TimelineGrid({
  days,
  timeZone,
  occurrences,
  onSelectOccurrence,
  onSelectSlot,
  refreshControl,
}: TimelineGridProps) {
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null)
  const hourSlots = useMemo<HourSlot[]>(() => getHourSlots(), [])
  const todayStr = useMemo(
    () => formatLocalDateString(new Date(), timeZone),
    [timeZone]
  )

  // Current time position
  const nowParts = useMemo(
    () => getTimezoneParts(new Date(), timeZone),
    [timeZone]
  )
  const currentMinutes = nowParts ? nowParts.hour * 60 + nowParts.minute : 0
  const currentTimeTop = (currentMinutes / 1440) * TOTAL_GRID_HEIGHT

  // Auto-scroll to current time or 8:00 AM on initial mount
  useEffect(() => {
    const targetHour = nowParts ? Math.max(0, nowParts.hour - 1) : 8
    const scrollY = Math.max(0, targetHour * HOUR_HEIGHT - 20)
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollY, animated: false })
    }, 50)
    return () => clearTimeout(timer)
  }, [nowParts])

  // Partition all-day vs timed occurrences for the visible days
  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDayMap = new Map<string, EventOccurrence[]>()
    const timedMap = new Map<string, EventOccurrence[]>()

    for (const d of days) {
      allDayMap.set(d, [])
      timedMap.set(d, [])
    }

    for (const occ of occurrences) {
      if (occ.isAllDay) {
        // Multi-day or single day all-day check
        const sDate = occ.startDate || ""
        const eDate = occ.endDate || sDate
        for (const d of days) {
          // If eDate > sDate, calendar all-day endDate is exclusive
          if (eDate > sDate) {
            if (d >= sDate && d < eDate) {
              allDayMap.get(d)?.push(occ)
            }
          } else {
            if (d === sDate) {
              allDayMap.get(d)?.push(occ)
            }
          }
        }
      } else {
        if (!occ.startTime) continue
        const pDate = parseDate(occ.startTime)
        if (!pDate) continue
        const dStr = formatLocalDateString(pDate, timeZone)
        if (timedMap.has(dStr)) {
          timedMap.get(dStr)?.push(occ)
        }
      }
    }

    return { allDayByDay: allDayMap, timedByDay: timedMap }
  }, [days, occurrences, timeZone])

  const hasAnyAllDay = useMemo(() => {
    for (const d of days) {
      const list = allDayByDay.get(d)
      if (list && list.length > 0) return true
    }
    return false
  }, [days, allDayByDay])

  return (
    <View style={styles.container}>
      {/* Pinned Day Column Header (useful especially for 3-Day mode) */}
      <View style={styles.headerRow}>
        <View style={styles.timeColHeader}>
          <Text style={styles.timeZoneText}>
            {timeZone.split("/").pop()?.replace(/_/g, " ").slice(0, 8)}
          </Text>
        </View>
        <View style={styles.daysHeaderContainer}>
          {days.map((dayStr) => {
            const [y, m, d] = dayStr.split("-").map(Number)
            const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
            const weekday = new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              timeZone,
            }).format(noonUtc)
            const isToday = dayStr === todayStr

            return (
              <View key={dayStr} style={styles.dayHeaderCol}>
                <Text
                  style={[
                    styles.dayHeaderWeekday,
                    isToday && styles.dayHeaderTextToday,
                  ]}
                >
                  {weekday}
                </Text>
                <View
                  style={[
                    styles.dayHeaderBadge,
                    isToday && styles.dayHeaderBadgeToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayHeaderDayNumber,
                      isToday && styles.dayHeaderDayNumberToday,
                    ]}
                  >
                    {d}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </View>

      {/* Pinned All-Day Event Bar (if any all-day events exist) */}
      {hasAnyAllDay && (
        <View style={styles.allDaySection}>
          <View style={styles.allDayLabelCol}>
            <Text style={styles.allDayLabelText}>all-day</Text>
          </View>
          <View style={styles.allDayColumnsContainer}>
            {days.map((dayStr) => {
              const dayAllDay = allDayByDay.get(dayStr) || []
              return (
                <View key={dayStr} style={styles.allDayCol}>
                  {dayAllDay.map((occ) => {
                    const color = occ.color || theme.colors.primary
                    return (
                      <TouchableOpacity
                        key={occ.instanceId || occ.eventId}
                        activeOpacity={0.7}
                        onPress={() => {
                          haptics.light()
                          onSelectOccurrence(occ)
                        }}
                        style={[
                          styles.allDayPill,
                          {
                            backgroundColor: color,
                          },
                        ]}
                        testID={`allday-pill-${occ.instanceId || occ.eventId}`}
                      >
                        <Text numberOfLines={1} style={styles.allDayPillText}>
                          {occ.title || "(No title)"}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* Vertical Scrollable Hour Grid */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gridContainer}>
          {/* Hour Labels Left Column */}
          <View style={styles.timeLabelsColumn}>
            {hourSlots.map((slot) => (
              <View
                key={slot.timeString}
                style={[styles.hourSlotLabel, { height: HOUR_HEIGHT }]}
              >
                <Text style={styles.timeLabelText}>{slot.label}</Text>
              </View>
            ))}
          </View>

          {/* Day Grid Columns */}
          <View style={styles.dayColumnsRow}>
            {days.map((dayStr, colIndex) => {
              const dayTimed = timedByDay.get(dayStr) || []
              const layoutItems = computeTimedEventLayout(
                dayTimed,
                dayStr,
                timeZone
              )
              const isToday = dayStr === todayStr

              return (
                <View
                  key={dayStr}
                  style={[
                    styles.dayGridCol,
                    colIndex > 0 && styles.dayGridColBorder,
                  ]}
                >
                  {/* Grid Lines for each hour */}
                  {hourSlots.map((slot) => (
                    <TouchableOpacity
                      key={slot.timeString}
                      activeOpacity={1}
                      onPress={() => {
                        if (onSelectSlot) {
                          haptics.light()
                          onSelectSlot(dayStr, slot.timeString)
                        }
                      }}
                      style={[styles.hourLine, { height: HOUR_HEIGHT }]}
                      testID={`slot-${dayStr}-${slot.timeString}`}
                    />
                  ))}

                  {/* Current Time Indicator Line */}
                  {isToday && (
                    <View
                      style={[styles.currentTimeLine, { top: currentTimeTop }]}
                      pointerEvents="none"
                    >
                      <View style={styles.currentTimeCircle} />
                      <View style={styles.currentTimeBar} />
                    </View>
                  )}

                  {/* Render Event Boxes */}
                  {layoutItems.map((item) => {
                    const occ = item.event
                    const top = (item.topPct / 100) * TOTAL_GRID_HEIGHT
                    const height = Math.max(
                      24,
                      (item.heightPct / 100) * TOTAL_GRID_HEIGHT - 2
                    )
                    const leftPct = `${item.leftPct}%`
                    const widthPct = `${item.widthPct}%`
                    const eventColor = occ.color || theme.colors.primary

                    return (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.8}
                        onPress={() => {
                          haptics.light()
                          onSelectOccurrence(occ)
                        }}
                        style={[
                          styles.eventCard,
                          {
                            top,
                            height,
                            left: leftPct as unknown as number,
                            width: widthPct as unknown as number,
                            zIndex: item.zIndex + 2,
                            backgroundColor: theme.colors.surfaceElevated,
                            borderLeftColor: eventColor,
                          },
                        ]}
                        testID={`event-card-${occ.instanceId || occ.eventId}`}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.eventTitle,
                            { color: theme.colors.textPrimary },
                          ]}
                        >
                          {occ.title || "(No title)"}
                        </Text>
                        {height >= 36 && (
                          <Text numberOfLines={1} style={styles.eventTime}>
                            {formatEventTime(occ, timeZone)}
                          </Text>
                        )}
                        {height >= 56 && occ.location ? (
                          <Text numberOfLines={1} style={styles.eventLocation}>
                            {occ.location}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  timeColHeader: {
    width: TIME_COL_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    paddingVertical: 6,
  },
  timeZoneText: {
    fontSize: 9,
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
  },
  daysHeaderContainer: {
    flex: 1,
    flexDirection: "row",
  },
  dayHeaderCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  dayHeaderWeekday: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
  },
  dayHeaderTextToday: {
    color: theme.colors.primary,
  },
  dayHeaderBadge: {
    marginTop: 2,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  dayHeaderBadgeToday: {
    backgroundColor: theme.colors.primary,
  },
  dayHeaderDayNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  dayHeaderDayNumberToday: {
    color: theme.colors.primaryForeground,
  },
  allDaySection: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    maxHeight: 70,
  },
  allDayLabelCol: {
    width: TIME_COL_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    paddingHorizontal: 4,
  },
  allDayLabelText: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.textMuted,
  },
  allDayColumnsContainer: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 4,
  },
  allDayCol: {
    flex: 1,
    paddingHorizontal: 4,
    gap: 3,
  },
  allDayPill: {
    borderRadius: theme.radius.xs,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  allDayPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ffffff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    height: TOTAL_GRID_HEIGHT + 30,
  },
  gridContainer: {
    flexDirection: "row",
    height: TOTAL_GRID_HEIGHT,
  },
  timeLabelsColumn: {
    width: TIME_COL_WIDTH,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  hourSlotLabel: {
    justifyContent: "flex-start",
    paddingTop: 2,
    paddingRight: 6,
    alignItems: "flex-end",
  },
  timeLabelText: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.textMuted,
  },
  dayColumnsRow: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
  },
  dayGridCol: {
    flex: 1,
    position: "relative",
  },
  dayGridColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  hourLine: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  currentTimeLine: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
    height: 10,
    marginTop: -5,
  },
  currentTimeCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.destructive,
    marginLeft: -4,
  },
  currentTimeBar: {
    flex: 1,
    height: 2,
    backgroundColor: theme.colors.destructive,
  },
  eventCard: {
    position: "absolute",
    borderLeftWidth: 3,
    borderRadius: theme.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  eventTitle: {
    fontSize: 11,
    fontWeight: "700",
  },
  eventTime: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  eventLocation: {
    fontSize: 9,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
})
