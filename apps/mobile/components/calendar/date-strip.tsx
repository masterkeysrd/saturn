import { useMemo, useRef } from "react"
import { View, Text, TouchableOpacity } from "react-native"
import {
  getWeekDays,
  getMonthMatrix,
  formatLocalDateString,
  getTimezoneParts,
  type MonthDayCell,
  type WeekDayHeader,
} from "@saturn/core"
import { useThemedStyles, type SaturnMobileTheme } from "../../lib/theme"
import { haptics } from "../../lib/haptics"

export interface DateStripProps {
  selectedDate: Date
  timeZone: string
  weekStartsOn?: 0 | 1
  isExpanded: boolean
  onSelectDate: (date: Date) => void
  eventsByDate?: Set<string>
}

export function stepCalendarStripDate(
  selectedDate: Date,
  timeZone: string,
  direction: "prev" | "next",
  isExpanded: boolean
): Date {
  const parts = getTimezoneParts(selectedDate, timeZone)
  if (!parts) return selectedDate
  if (isExpanded) {
    const targetMonthIndex =
      direction === "next" ? parts.month : parts.month - 2
    return new Date(Date.UTC(parts.year, targetMonthIndex, 1, 12, 0, 0))
  }
  const dayOffset = direction === "next" ? 7 : -7
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, 12, 0, 0)
  )
}

export function resolveHorizontalSwipeDirection(
  dx: number,
  dy: number,
  threshold = 36
): "prev" | "next" | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  if (Math.abs(dx) < threshold) return null
  if (Math.abs(dy) >= Math.abs(dx)) return null
  return dx < 0 ? "next" : "prev"
}

interface TouchPoint {
  x: number
  y: number
}

interface TouchCoordLike {
  pageX?: number
  pageY?: number
  clientX?: number
  clientY?: number
}

interface TouchEventLike {
  nativeEvent?: {
    pageX?: number
    pageY?: number
    changedTouches?: ArrayLike<TouchCoordLike>
    touches?: ArrayLike<TouchCoordLike>
  }
  changedTouches?: ArrayLike<TouchCoordLike>
  touches?: ArrayLike<TouchCoordLike>
}

function extractTouchPoint(event: unknown): TouchPoint | null {
  if (!event || typeof event !== "object") return null
  const e = event as TouchEventLike
  const ne = e.nativeEvent
  if (ne && typeof ne.pageX === "number" && typeof ne.pageY === "number") {
    return { x: ne.pageX, y: ne.pageY }
  }
  const touch =
    ne?.changedTouches?.[0] ??
    ne?.touches?.[0] ??
    e.changedTouches?.[0] ??
    e.touches?.[0]
  if (!touch) return null
  const x = touch.pageX ?? touch.clientX
  const y = touch.pageY ?? touch.clientY
  if (typeof x !== "number" || typeof y !== "number") return null
  return { x, y }
}

export function DateStrip({
  selectedDate,
  timeZone,
  weekStartsOn = 0,
  isExpanded,
  onSelectDate,
  eventsByDate,
}: DateStripProps) {
  const styles = useThemedStyles(createStyles)
  const touchStartRef = useRef<TouchPoint | null>(null)

  const selectedParts = useMemo(
    () => getTimezoneParts(selectedDate, timeZone),
    [selectedDate, timeZone]
  )
  const selectedDateStr = useMemo(
    () => formatLocalDateString(selectedDate, timeZone),
    [selectedDate, timeZone]
  )

  const weekDays = useMemo<WeekDayHeader[]>(() => {
    return getWeekDays(selectedDate, {
      timeZone,
      weekStartsOn,
    })
  }, [selectedDate, timeZone, weekStartsOn])

  const monthMatrix = useMemo<MonthDayCell[][]>(() => {
    if (!selectedParts) return []
    return getMonthMatrix(selectedParts.year, selectedParts.month, {
      timeZone,
      weekStartsOn,
      fixedWeeks: false,
    })
  }, [selectedParts, timeZone, weekStartsOn])

  const handleSelectDay = (cellDate: Date) => {
    haptics.selection()
    onSelectDate(cellDate)
  }

  const handleTouchStart = (event: unknown) => {
    touchStartRef.current = extractTouchPoint(event)
  }

  const handleTouchEnd = (event: unknown) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const end = extractTouchPoint(event)
    if (!end) return
    const dir = resolveHorizontalSwipeDirection(
      end.x - start.x,
      end.y - start.y
    )
    if (!dir) return
    haptics.light()
    onSelectDate(stepCalendarStripDate(selectedDate, timeZone, dir, isExpanded))
  }

  const handleTouchCancel = () => {
    touchStartRef.current = null
  }

  const weekdayInitials =
    weekStartsOn === 1
      ? ["M", "T", "W", "T", "F", "S", "S"]
      : ["S", "M", "T", "W", "T", "F", "S"]

  return (
    <View
      style={styles.container}
      testID="calendar-date-strip"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Weekday Initials Header (when expanded) */}
      {isExpanded && (
        <View style={styles.weekdayInitialsRow}>
          {weekdayInitials.map((initial, i) => (
            <Text key={i} style={styles.weekdayInitialText}>
              {initial}
            </Text>
          ))}
        </View>
      )}

      {/* Main Strip content: Week strip or Month grid */}
      {!isExpanded ? (
        <View style={styles.weekRow}>
          {weekDays.map((wDay) => {
            const isSelected = wDay.dateString === selectedDateStr
            const isToday = wDay.isToday
            const hasEvents = eventsByDate?.has(wDay.dateString)

            return (
              <TouchableOpacity
                key={wDay.dateString}
                activeOpacity={0.7}
                onPress={() => handleSelectDay(wDay.date)}
                style={[
                  styles.dayPill,
                  isSelected && styles.dayPillSelected,
                  !isSelected && isToday && styles.dayPillToday,
                ]}
                testID={`day-pill-${wDay.dateString}`}
              >
                <Text
                  style={[
                    styles.dayPillWeekName,
                    isSelected && styles.dayPillTextSelected,
                    !isSelected && isToday && styles.dayPillTextToday,
                  ]}
                >
                  {wDay.dayName.slice(0, 3)}
                </Text>
                <Text
                  style={[
                    styles.dayPillNumber,
                    isSelected && styles.dayPillTextSelected,
                    !isSelected && isToday && styles.dayPillTextToday,
                  ]}
                >
                  {wDay.dayNumber}
                </Text>
                <View
                  style={[
                    styles.eventDot,
                    hasEvents &&
                      (isSelected
                        ? styles.eventDotSelected
                        : styles.eventDotActive),
                  ]}
                />
              </TouchableOpacity>
            )
          })}
        </View>
      ) : (
        <View style={styles.monthMatrixContainer}>
          {monthMatrix.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.monthWeekRow}>
              {week.map((cell) => {
                const isSelected = cell.dateString === selectedDateStr
                const isToday = cell.isToday
                const hasEvents = eventsByDate?.has(cell.dateString)

                return (
                  <TouchableOpacity
                    key={cell.dateString}
                    activeOpacity={0.7}
                    onPress={() => handleSelectDay(cell.date)}
                    style={[
                      styles.monthCell,
                      isSelected && styles.monthCellSelected,
                      !isSelected && isToday && styles.monthCellToday,
                    ]}
                    testID={`month-cell-${cell.dateString}`}
                  >
                    <Text
                      style={[
                        styles.monthCellNumber,
                        !cell.isCurrentMonth && styles.monthCellNumberDimmed,
                        isSelected && styles.dayPillTextSelected,
                        !isSelected && isToday && styles.dayPillTextToday,
                      ]}
                    >
                      {cell.day}
                    </Text>
                    <View
                      style={[
                        styles.eventDot,
                        hasEvents &&
                          (isSelected
                            ? styles.eventDotSelected
                            : styles.eventDotActive),
                      ]}
                    />
                  </TouchableOpacity>
                )
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    backgroundColor: t.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
  },
  weekRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    gap: 4,
  },
  dayPill: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 8,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 58,
  },
  dayPillToday: {
    borderColor: t.colors.primary,
  },
  dayPillSelected: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  dayPillWeekName: {
    fontSize: 11,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
    marginBottom: 2,
    textTransform: "uppercase" as const,
  },
  dayPillNumber: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  dayPillTextToday: {
    color: t.colors.primary,
  },
  dayPillTextSelected: {
    color: t.colors.primaryForeground,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "transparent",
    marginTop: 4,
  },
  eventDotActive: {
    backgroundColor: t.colors.primary,
  },
  eventDotSelected: {
    backgroundColor: t.colors.primaryForeground,
  },
  weekdayInitialsRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    marginBottom: 6,
  },
  weekdayInitialText: {
    flex: 1,
    textAlign: "center" as const,
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  monthMatrixContainer: {
    gap: 4,
  },
  monthWeekRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    gap: 4,
  },
  monthCell: {
    flex: 1,
    height: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: "transparent",
  },
  monthCellToday: {
    borderColor: t.colors.primary,
  },
  monthCellSelected: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  monthCellNumber: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  monthCellNumberDimmed: {
    color: t.colors.textMuted,
    opacity: 0.4,
  },
})
