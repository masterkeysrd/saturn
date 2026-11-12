import { useMemo, useState, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  useAnimatedValue,
} from "react-native"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native"
import {
  getWeekDays,
  getMonthMatrix,
  formatLocalDateString,
  getTimezoneParts,
  type MonthDayCell,
  type WeekDayHeader,
} from "@saturn/core"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface DateStripProps {
  selectedDate: Date
  timeZone: string
  onSelectDate: (date: Date) => void
  eventsByDate?: Set<string>
}

export function DateStrip({
  selectedDate,
  timeZone,
  onSelectDate,
  eventsByDate,
}: DateStripProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const animValue = useAnimatedValue(0)

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: isExpanded ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start()
  }, [isExpanded, animValue])

  const selectedParts = useMemo(
    () => getTimezoneParts(selectedDate, timeZone),
    [selectedDate, timeZone]
  )
  const selectedDateStr = useMemo(
    () => formatLocalDateString(selectedDate, timeZone),
    [selectedDate, timeZone]
  )

  const monthYearLabel = useMemo(() => {
    if (!selectedParts) return ""
    const noonUtc = new Date(
      Date.UTC(selectedParts.year, selectedParts.month - 1, 15, 12, 0, 0)
    )
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone,
    }).format(noonUtc)
  }, [selectedParts, timeZone])

  const weekDays = useMemo<WeekDayHeader[]>(() => {
    return getWeekDays(selectedDate, {
      timeZone,
      weekStartsOn: 0,
    })
  }, [selectedDate, timeZone])

  const monthMatrix = useMemo<MonthDayCell[][]>(() => {
    if (!selectedParts) return []
    return getMonthMatrix(selectedParts.year, selectedParts.month, {
      timeZone,
      weekStartsOn: 0,
      fixedWeeks: false,
    })
  }, [selectedParts, timeZone])

  const handlePrev = () => {
    haptics.light()
    if (!selectedParts) return
    if (isExpanded) {
      // Prev month
      const prevMonthNoon = new Date(
        Date.UTC(selectedParts.year, selectedParts.month - 2, 1, 12, 0, 0)
      )
      onSelectDate(prevMonthNoon)
    } else {
      // Prev week (7 days ago)
      const prevWeekNoon = new Date(
        Date.UTC(
          selectedParts.year,
          selectedParts.month - 1,
          selectedParts.day - 7,
          12,
          0,
          0
        )
      )
      onSelectDate(prevWeekNoon)
    }
  }

  const handleNext = () => {
    haptics.light()
    if (!selectedParts) return
    if (isExpanded) {
      // Next month
      const nextMonthNoon = new Date(
        Date.UTC(selectedParts.year, selectedParts.month, 1, 12, 0, 0)
      )
      onSelectDate(nextMonthNoon)
    } else {
      // Next week (7 days later)
      const nextWeekNoon = new Date(
        Date.UTC(
          selectedParts.year,
          selectedParts.month - 1,
          selectedParts.day + 7,
          12,
          0,
          0
        )
      )
      onSelectDate(nextWeekNoon)
    }
  }

  const toggleExpanded = () => {
    haptics.selection()
    setIsExpanded((prev) => !prev)
  }

  const handleSelectDay = (cellDate: Date) => {
    haptics.selection()
    onSelectDate(cellDate)
  }

  const weekdayInitials = ["S", "M", "T", "W", "T", "F", "S"]

  return (
    <View style={styles.container}>
      {/* Top Header: Month & Year + Prev/Next + Expand/Collapse button */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={toggleExpanded}
          style={styles.monthTitleButton}
          testID="calendar-strip-toggle"
        >
          <Text style={styles.monthTitleText}>{monthYearLabel}</Text>
          {isExpanded ? (
            <ChevronUp size={16} color={theme.colors.textSecondary} />
          ) : (
            <ChevronDown size={16} color={theme.colors.textSecondary} />
          )}
        </TouchableOpacity>

        <View style={styles.navRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePrev}
            style={styles.navButton}
            testID="calendar-strip-prev"
          >
            <ChevronLeft size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNext}
            style={styles.navButton}
            testID="calendar-strip-next"
          >
            <ChevronRight size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

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

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  monthTitleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: theme.radius.sm,
  },
  monthTitleText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  navButton: {
    padding: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceElevated,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  dayPill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 58,
  },
  dayPillToday: {
    borderColor: theme.colors.primary,
  },
  dayPillSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dayPillWeekName: {
    fontSize: 11,
    fontWeight: "500",
    color: theme.colors.textMuted,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  dayPillNumber: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  dayPillTextToday: {
    color: theme.colors.primary,
  },
  dayPillTextSelected: {
    color: theme.colors.primaryForeground,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "transparent",
    marginTop: 4,
  },
  eventDotActive: {
    backgroundColor: theme.colors.primary,
  },
  eventDotSelected: {
    backgroundColor: theme.colors.primaryForeground,
  },
  weekdayInitialsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: 6,
  },
  weekdayInitialText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  monthMatrixContainer: {
    gap: 4,
  },
  monthWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  monthCell: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: "transparent",
  },
  monthCellToday: {
    borderColor: theme.colors.primary,
  },
  monthCellSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  monthCellNumber: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  monthCellNumberDimmed: {
    color: theme.colors.textMuted,
    opacity: 0.4,
  },
})
