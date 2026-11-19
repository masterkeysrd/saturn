import React, { useState, useEffect } from "react"
import { Modal, StyleSheet, Text, View, TouchableOpacity } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ChevronLeft, ChevronRight } from "lucide-react-native"
import { formatLocalDateString, getTimezoneParts } from "@saturn/core"
import { useTimezone } from "@saturn/hooks"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { BottomSheetHeader } from "./bottom-sheet"

function makeNoonInTimezone(
  year: number,
  month: number,
  day: number,
  timeZone: string
): Date {
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const tzParts = getTimezoneParts(utcNoon, timeZone)
  if (!tzParts) return utcNoon
  const localAsUtc = Date.UTC(
    tzParts.year,
    tzParts.month - 1,
    tzParts.day,
    tzParts.hour,
    tzParts.minute,
    tzParts.second
  )
  const offsetMs = localAsUtc - utcNoon.getTime()
  return new Date(utcNoon.getTime() - offsetMs)
}

export function toLocalISODate(d: Date, timeZone?: string): string {
  const tzName =
    timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const dateStr = formatLocalDateString(d, tzName)
  return `${dateStr}T12:00:00Z`
}

export function formatDisplayDate(date: Date, timeZone?: string): string {
  const tzName =
    timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const dateParts = getTimezoneParts(date, tzName)
  const todayParts = getTimezoneParts(new Date(), tzName)
  if (!dateParts || !todayParts) {
    return ""
  }

  const todayNoon = makeNoonInTimezone(
    todayParts.year,
    todayParts.month,
    todayParts.day,
    tzName
  )
  const yesterdayNoon = new Date(todayNoon.getTime() - 86400000)
  const yesterdayParts = getTimezoneParts(yesterdayNoon, tzName)

  const isToday =
    dateParts.year === todayParts.year &&
    dateParts.month === todayParts.month &&
    dateParts.day === todayParts.day

  const isYesterday = Boolean(
    yesterdayParts &&
    dateParts.year === yesterdayParts.year &&
    dateParts.month === yesterdayParts.month &&
    dateParts.day === yesterdayParts.day
  )

  const formattedStr = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: dateParts.year !== todayParts.year ? "numeric" : undefined,
    timeZone: tzName,
  }).format(date)

  if (isToday) return `Today (${formattedStr})`
  if (isYesterday) return `Yesterday (${formattedStr})`
  return formattedStr
}

export interface DatePickerSheetProps {
  visible: boolean
  title?: string
  value: Date
  onChange: (date: Date) => void
  onClose: () => void
}

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

export function DatePickerSheet({
  visible,
  title = "Select Date",
  value,
  onChange,
  onClose,
}: DatePickerSheetProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const insets = useSafeAreaInsets()
  const tz = useTimezone()
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(value)

  useEffect(() => {
    setCalendarViewDate(value)
  }, [value])

  const handlePrevMonth = () => {
    haptics.light()
    setCalendarViewDate((prev) => {
      const parts = tz.parts(prev)
      if (!parts) return prev
      const targetYear = parts.month === 1 ? parts.year - 1 : parts.year
      const targetMonth = parts.month === 1 ? 12 : parts.month - 1
      return makeNoonInTimezone(targetYear, targetMonth, 1, tz.timezone)
    })
  }

  const handleNextMonth = () => {
    haptics.light()
    setCalendarViewDate((prev) => {
      const parts = tz.parts(prev)
      if (!parts) return prev
      const targetYear = parts.month === 12 ? parts.year + 1 : parts.year
      const targetMonth = parts.month === 12 ? 1 : parts.month + 1
      return makeNoonInTimezone(targetYear, targetMonth, 1, tz.timezone)
    })
  }

  const handleSelectDay = (day: number) => {
    haptics.light()
    const newDate = makeNoonInTimezone(
      calendarData.year,
      calendarData.month,
      day,
      tz.timezone
    )
    onChange(newDate)
    onClose()
  }

  const handleSelectPreset = (
    type: "today" | "yesterday" | "2days" | "firstOfMonth"
  ) => {
    haptics.light()
    const nowParts = tz.parts(tz.now())
    if (!nowParts) return
    const todayNoon = makeNoonInTimezone(
      nowParts.year,
      nowParts.month,
      nowParts.day,
      tz.timezone
    )
    let target = todayNoon
    if (type === "yesterday") {
      target = new Date(todayNoon.getTime() - 86400000)
    } else if (type === "2days") {
      target = new Date(todayNoon.getTime() - 2 * 86400000)
    } else if (type === "firstOfMonth") {
      target = makeNoonInTimezone(nowParts.year, nowParts.month, 1, tz.timezone)
    }

    onChange(target)
    onClose()
  }

  const timeZone = tz.timezone
  const parts = getTimezoneParts(calendarViewDate, timeZone)
  const fallback = new Date()
  const year = parts?.year ?? fallback.getUTCFullYear()
  const month = parts?.month ?? fallback.getUTCMonth() + 1

  const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone,
  }).format(makeNoonInTimezone(year, month, 1, timeZone))

  const days: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(d)
  }

  const calendarData = { monthName, days, year, month }

  const selectedParts = tz.parts(value)
  const todayParts = tz.parts(tz.now())

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheetContainer,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
        >
          <View style={styles.handleIndicator} />
          <View style={styles.headerWrapper}>
            <BottomSheetHeader title={title} onClose={onClose} />
          </View>
          <View style={styles.calendarContainer}>
            {/* Quick Presets Row */}
            <View style={styles.calendarPresetsRow}>
              <TouchableOpacity
                style={styles.calendarPresetChip}
                activeOpacity={0.7}
                onPress={() => handleSelectPreset("today")}
              >
                <Text style={styles.calendarPresetChipText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calendarPresetChip}
                activeOpacity={0.7}
                onPress={() => handleSelectPreset("yesterday")}
              >
                <Text style={styles.calendarPresetChipText}>Yesterday</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calendarPresetChip}
                activeOpacity={0.7}
                onPress={() => handleSelectPreset("2days")}
              >
                <Text style={styles.calendarPresetChipText}>2 Days Ago</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calendarPresetChip}
                activeOpacity={0.7}
                onPress={() => handleSelectPreset("firstOfMonth")}
              >
                <Text style={styles.calendarPresetChipText}>1st of Month</Text>
              </TouchableOpacity>
            </View>

            {/* Month & Year Navigation Header */}
            <View style={styles.calendarMonthHeader}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={handlePrevMonth}
                activeOpacity={0.6}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ChevronLeft size={20} color={colors.textPrimary} />
              </TouchableOpacity>

              <Text style={styles.calendarMonthTitle}>
                {calendarData.monthName}
              </Text>

              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={handleNextMonth}
                activeOpacity={0.6}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ChevronRight size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Day of Week Headers */}
            <View style={styles.calendarWeekRow}>
              {WEEK_DAYS.map((dayName) => (
                <View key={dayName} style={styles.calendarDayHeaderCell}>
                  <Text style={styles.calendarDayHeaderText}>{dayName}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Days Grid */}
            <View style={styles.calendarDaysGrid}>
              {calendarData.days.map((day, idx) => {
                if (day === null) {
                  return (
                    <View key={`empty-${idx}`} style={styles.calendarDayCell} />
                  )
                }

                const isSelected = Boolean(
                  selectedParts &&
                  selectedParts.year === calendarData.year &&
                  selectedParts.month === calendarData.month &&
                  selectedParts.day === day
                )

                const isToday = Boolean(
                  todayParts &&
                  todayParts.year === calendarData.year &&
                  todayParts.month === calendarData.month &&
                  todayParts.day === day
                )

                return (
                  <View key={`day-${day}`} style={styles.calendarDayCell}>
                    <TouchableOpacity
                      style={[
                        styles.calendarDayCircle,
                        isToday && styles.calendarDayToday,
                        isSelected && styles.calendarDaySelected,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => handleSelectDay(day)}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          isToday && styles.calendarDayTextToday,
                          isSelected && styles.calendarDayTextSelected,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  modalOverlay: {
    flex: 1,
    backgroundColor: t.isDark ? "rgba(0, 0, 0, 0.65)" : "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end" as const,
  },
  sheetContainer: {
    backgroundColor: t.colors.surface,
    borderTopWidth: 1,
    borderTopColor: t.colors.borderStrong,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
    paddingTop: 10,
  },
  handleIndicator: {
    backgroundColor: t.colors.borderStrong,
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center" as const,
    marginBottom: 8,
  },
  headerWrapper: {
    paddingHorizontal: 16,
  },
  calendarContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  calendarPresetsRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 16,
  },
  calendarPresetChip: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  calendarPresetChipText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
    textAlign: "center" as const,
  },
  calendarMonthHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  calendarWeekRow: {
    flexDirection: "row" as const,
    marginBottom: 8,
  },
  calendarDayHeaderCell: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  calendarDayHeaderText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  calendarDaysGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
  },
  calendarDayCell: {
    width: "14.2857%" as const,
    aspectRatio: 1,
    padding: 3,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  calendarDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  calendarDayToday: {
    borderWidth: 1.5,
    borderColor: t.colors.primary,
  },
  calendarDaySelected: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
  },
  calendarDayTextToday: {
    color: t.colors.primary,
    fontWeight: "700" as const,
  },
  calendarDayTextSelected: {
    color: t.colors.primaryForeground,
    fontWeight: "700" as const,
  },
})
