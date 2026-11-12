import { forwardRef, useState, useMemo } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native"
import BottomSheet from "@gorhom/bottom-sheet"
import { Plus, Check } from "lucide-react-native"
import {
  useCalendars,
  useUpdateCalendar,
  useCreateCalendar,
  type Calendar,
} from "@saturn/hooks"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface CalendarFilterSheetProps {
  onClose?: () => void
  canManage?: boolean
}

const PRESET_COLORS = [
  "#38bdf8",
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f43f5e",
]

export const CalendarFilterSheet = forwardRef<
  BottomSheet,
  CalendarFilterSheetProps
>(({ onClose, canManage = true }, ref) => {
  const { data: calendarsData, isLoading } = useCalendars()
  const updateCalendarMutation = useUpdateCalendar()
  const createCalendarMutation = useCreateCalendar()

  const calendars = useMemo(
    () => calendarsData?.calendars || [],
    [calendarsData]
  )

  // Quick create calendar state
  const [isCreating, setIsCreating] = useState(false)
  const [newCalendarName, setNewCalendarName] = useState("")
  const [newCalendarColor, setNewCalendarColor] = useState(PRESET_COLORS[0])

  // Partition into Space native calendars vs Connected Account calendars
  const { nativeCalendars, connectedCalendars } = useMemo(() => {
    const native: Calendar[] = []
    const connected: Calendar[] = []

    for (const cal of calendars) {
      if (cal.connectedAccountId) {
        connected.push(cal)
      } else {
        native.push(cal)
      }
    }

    return { nativeCalendars: native, connectedCalendars: connected }
  }, [calendars])

  const handleToggleCalendar = async (cal: Calendar) => {
    haptics.selection()
    await updateCalendarMutation.mutateAsync({
      id: cal.id,
      calendar: {
        isEnabled: !cal.isEnabled,
      },
    })
  }

  const handleCreateSubmit = async () => {
    if (!newCalendarName.trim()) return
    haptics.light()
    try {
      await createCalendarMutation.mutateAsync({
        calendar: {
          id: "",
          name: newCalendarName.trim(),
          description: "",
          color: newCalendarColor,
          timezone: "UTC",
          isEnabled: true,
        },
      })
      haptics.success()
      setNewCalendarName("")
      setIsCreating(false)
    } catch {
      haptics.error()
    }
  }

  return (
    <AppBottomSheet
      ref={ref}
      title="Calendars & Filters"
      snapPoints={["55%", "85%"]}
      onClose={onClose}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : (
          <>
            {/* Space Native Calendars Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Space Calendars</Text>
                {canManage && !isCreating && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      haptics.light()
                      setIsCreating(true)
                    }}
                    style={styles.addButton}
                    testID="calendar-filter-add-btn"
                  >
                    <Plus size={14} color={theme.colors.primary} />
                    <Text style={styles.addButtonText}>New</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Quick Create Calendar Form */}
              {isCreating && (
                <View style={styles.createCard} testID="calendar-create-card">
                  <Text style={styles.createCardTitle}>
                    Create Space Calendar
                  </Text>
                  <TextInput
                    value={newCalendarName}
                    onChangeText={setNewCalendarName}
                    placeholder="Calendar Name"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.createInput}
                    autoFocus
                    testID="calendar-name-input"
                  />
                  <View style={styles.colorPaletteRow}>
                    {PRESET_COLORS.map((col) => (
                      <TouchableOpacity
                        key={col}
                        activeOpacity={0.7}
                        onPress={() => {
                          haptics.selection()
                          setNewCalendarColor(col)
                        }}
                        style={[
                          styles.colorCircle,
                          { backgroundColor: col },
                          newCalendarColor === col &&
                            styles.colorCircleSelected,
                        ]}
                      >
                        {newCalendarColor === col && (
                          <Check size={12} color="#ffffff" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.createActionsRow}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        haptics.light()
                        setIsCreating(false)
                        setNewCalendarName("")
                      }}
                      style={styles.cancelBtn}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={handleCreateSubmit}
                      disabled={
                        !newCalendarName.trim() ||
                        createCalendarMutation.isPending
                      }
                      style={[
                        styles.submitBtn,
                        !newCalendarName.trim() && styles.submitBtnDisabled,
                      ]}
                      testID="calendar-create-submit-btn"
                    >
                      {createCalendarMutation.isPending ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.primaryForeground}
                        />
                      ) : (
                        <Text style={styles.submitBtnText}>Create</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* List Native Calendars */}
              <View style={styles.calendarList}>
                {nativeCalendars.map((cal) => (
                  <View key={cal.id} style={styles.calendarRow}>
                    <View style={styles.calendarInfo}>
                      <View
                        style={[
                          styles.calendarColorDot,
                          {
                            backgroundColor: cal.color || theme.colors.primary,
                          },
                        ]}
                      />
                      <Text numberOfLines={1} style={styles.calendarName}>
                        {cal.name}
                      </Text>
                      {cal.isDefaultNative && (
                        <View style={styles.defaultBadge}>
                          <Text style={styles.defaultBadgeText}>Default</Text>
                        </View>
                      )}
                    </View>
                    <Switch
                      value={cal.isEnabled}
                      onValueChange={() => handleToggleCalendar(cal)}
                      trackColor={{
                        false: theme.colors.surfaceHighlight,
                        true: theme.colors.primary,
                      }}
                      thumbColor="#ffffff"
                      testID={`calendar-toggle-${cal.id}`}
                    />
                  </View>
                ))}
              </View>
            </View>

            {/* Connected Account Sub-Calendars Section */}
            {connectedCalendars.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Connected Accounts</Text>
                <View style={styles.calendarList}>
                  {connectedCalendars.map((cal) => (
                    <View key={cal.id} style={styles.calendarRow}>
                      <View style={styles.calendarInfo}>
                        <View
                          style={[
                            styles.calendarColorDot,
                            {
                              backgroundColor:
                                cal.color || theme.colors.primary,
                            },
                          ]}
                        />
                        <Text numberOfLines={1} style={styles.calendarName}>
                          {cal.name}
                        </Text>
                        {cal.isPrimary && (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>Primary</Text>
                          </View>
                        )}
                      </View>
                      <Switch
                        value={cal.isEnabled}
                        onValueChange={() => handleToggleCalendar(cal)}
                        trackColor={{
                          false: theme.colors.surfaceHighlight,
                          true: theme.colors.primary,
                        }}
                        thumbColor="#ffffff"
                        testID={`calendar-toggle-${cal.id}`}
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </AppBottomSheet>
  )
})

CalendarFilterSheet.displayName = "CalendarFilterSheet"

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 20,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: theme.radius.xs,
    backgroundColor: theme.colors.primarySubtle,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  createCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    gap: 10,
  },
  createCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  createInput: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  colorPaletteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  colorCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  colorCircleSelected: {
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  createActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  cancelBtnText: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  submitBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.primaryForeground,
  },
  calendarList: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  calendarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  calendarInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  calendarColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  calendarName: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  defaultBadge: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
  },
  defaultBadgeText: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
})
