import React, { useState, useMemo, useEffect } from "react"
import { Modal, StyleSheet, Text, View, TouchableOpacity } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ChevronLeft, ChevronRight } from "lucide-react-native"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { BottomSheetHeader } from "./bottom-sheet"

export function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const date = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${date}T12:00:00Z`
}

export function formatDisplayDate(date: Date): string {
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()

  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  const formattedStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  })

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
  const insets = useSafeAreaInsets()
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(value)

  useEffect(() => {
    setCalendarViewDate(value)
  }, [value])

  const handlePrevMonth = () => {
    haptics.light()
    setCalendarViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    )
  }

  const handleNextMonth = () => {
    haptics.light()
    setCalendarViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    )
  }

  const handleSelectDay = (day: number) => {
    haptics.light()
    const newDate = new Date(
      calendarViewDate.getFullYear(),
      calendarViewDate.getMonth(),
      day,
      12,
      0,
      0
    )
    onChange(newDate)
    onClose()
  }

  const handleSelectPreset = (
    type: "today" | "yesterday" | "2days" | "firstOfMonth"
  ) => {
    haptics.light()
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    if (type === "yesterday") {
      d.setDate(d.getDate() - 1)
    } else if (type === "2days") {
      d.setDate(d.getDate() - 2)
    } else if (type === "firstOfMonth") {
      d.setDate(1)
    }

    onChange(d)
    onClose()
  }

  const calendarData = useMemo(() => {
    const year = calendarViewDate.getFullYear()
    const month = calendarViewDate.getMonth()

    const firstDayOfWeek = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const monthName = calendarViewDate.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    })

    const days: (number | null)[] = []
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null)
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d)
    }

    return { monthName, days, year, month }
  }, [calendarViewDate])

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
                <ChevronLeft size={20} color={theme.colors.textPrimary} />
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
                <ChevronRight size={20} color={theme.colors.textPrimary} />
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

                const isSelected =
                  value.getFullYear() === calendarData.year &&
                  value.getMonth() === calendarData.month &&
                  value.getDate() === day

                const now = new Date()
                const isToday =
                  now.getFullYear() === calendarData.year &&
                  now.getMonth() === calendarData.month &&
                  now.getDate() === day

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

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderStrong,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingTop: 10,
  },
  handleIndicator: {
    backgroundColor: "#475569",
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
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
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  calendarPresetChip: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarPresetChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  calendarMonthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  calendarWeekRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  calendarDayHeaderCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  calendarDaysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDayCell: {
    width: "14.2857%",
    aspectRatio: 1,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDayToday: {
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  calendarDaySelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  calendarDayTextToday: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  calendarDayTextSelected: {
    color: "#ffffff",
    fontWeight: "700",
  },
})
