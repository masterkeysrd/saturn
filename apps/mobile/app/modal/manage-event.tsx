import { useState, useMemo, useEffect, useRef } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput as RNTextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  X,
  Video,
  Trash2,
  ExternalLink,
  Plus,
  Globe,
  Check,
} from "lucide-react-native"
import {
  useTimezone,
  useCalendars,
  useGetEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useContactSuggestions,
} from "@saturn/hooks"
import {
  buildRRule,
  parseRRule,
  COMMON_TIMEZONES,
  type RecurrenceFrequency,
  type AttendeeFormValues,
} from "@saturn/schemas"
import {
  formatLocalDateString,
  getTimezoneParts,
  parseDate,
} from "@saturn/core"
import type { RecurrenceScope } from "@saturn/api/saturn/calendar/v1/calendar"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { useDebounce } from "@/lib/use-debounce"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"

export type ManageEventParams = {
  eventId?: string
  instanceId?: string
  initialTitle?: string
  initialDescription?: string
  initialStart?: string
  initialDate?: string
  initialStartTime?: string
  initialEndTime?: string
  initialAttendees?: string
  sourceMailMessageId?: string
  calendarId?: string
}

function parseInitialAttendees(raw?: string): AttendeeFormValues[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        if (typeof item === "string") {
          return {
            email: item.trim(),
            displayName: "",
            isOptional: false,
            responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
          }
        }
        return {
          email: item.email || "",
          displayName: item.displayName || "",
          isOptional: Boolean(item.isOptional),
          responseStatus:
            item.responseStatus || "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
        }
      })
    }
  } catch {
    return raw
      .split(",")
      .map((e) => ({
        email: e.trim(),
        displayName: "",
        isOptional: false,
        responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION" as const,
      }))
      .filter((a) => a.email.length > 0)
  }
  return []
}

function toUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const [y, m, d] = (dateStr || "2026-01-01").split("-").map(Number)
  const [hh, mm] = (timeStr || "09:00").split(":").map(Number)
  const targetUtc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0))
  const tzParts = getTimezoneParts(targetUtc, timeZone)
  if (!tzParts) return targetUtc.toISOString()
  const localAsUtc = new Date(
    Date.UTC(
      tzParts.year,
      tzParts.month - 1,
      tzParts.day,
      tzParts.hour,
      tzParts.minute,
      tzParts.second
    )
  )
  const offsetMs = localAsUtc.getTime() - targetUtc.getTime()
  return new Date(targetUtc.getTime() - offsetMs).toISOString()
}

function toExclusiveEndDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0))
  const ny = String(next.getUTCFullYear()).padStart(4, "0")
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0")
  const nd = String(next.getUTCDate()).padStart(2, "0")
  return `${ny}-${nm}-${nd}`
}

function toInclusiveEndDate(dateStr: string, startDateStr: string): string {
  if (!dateStr || dateStr <= startDateStr) return startDateStr
  const [y, m, d] = dateStr.split("-").map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0))
  const py = String(prev.getUTCFullYear()).padStart(4, "0")
  const pm = String(prev.getUTCMonth() + 1).padStart(2, "0")
  const pd = String(prev.getUTCDate()).padStart(2, "0")
  return `${py}-${pm}-${pd}`
}

export default function ManageEventModal() {
  const router = useRouter()
  const tz = useTimezone()
  const params = useLocalSearchParams<ManageEventParams>()
  const isEditMode = Boolean(params.eventId)

  // Calendars query
  const { data: calendarsData } = useCalendars()
  const calendars = useMemo(
    () => calendarsData?.calendars || [],
    [calendarsData]
  )

  // Fetch event if editing
  const { data: existingEvent } = useGetEvent(params.eventId, {
    enabled: isEditMode,
  })

  // Mutations
  const createMutation = useCreateEvent()
  const updateMutation = useUpdateEvent()
  const deleteMutation = useDeleteEvent()

  // Form State
  const [calendarId, setCalendarId] = useState<string>(() => {
    return (
      params.calendarId ||
      calendars.find((c) => c.isEnabled)?.id ||
      calendars[0]?.id ||
      ""
    )
  })

  const [title, setTitle] = useState<string>(() => params.initialTitle || "")
  const [description, setDescription] = useState<string>(
    () => params.initialDescription || ""
  )
  const [location, setLocation] = useState<string>("")
  const [isAllDay, setIsAllDay] = useState<boolean>(false)

  // Dates & Times
  const defaultDateStr = useMemo(() => {
    if (params.initialDate) return params.initialDate
    if (params.initialStart) {
      const p = parseDate(params.initialStart)
      if (p) return formatLocalDateString(p, tz.timezone)
    }
    return formatLocalDateString(new Date(), tz.timezone)
  }, [params.initialDate, params.initialStart, tz.timezone])

  const [startDate, setStartDate] = useState<string>(defaultDateStr)
  const [endDate, setEndDate] = useState<string>(defaultDateStr)
  const [startTime, setStartTime] = useState<string>(() => {
    if (params.initialStartTime) {
      return params.initialStartTime.length === 5
        ? params.initialStartTime
        : params.initialStartTime.slice(11, 16)
    }
    if (params.initialStart) {
      const p = parseDate(params.initialStart)
      if (p) {
        const parts = getTimezoneParts(p, tz.timezone)
        if (parts) {
          return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
        }
      }
    }
    return "09:00"
  })

  const [endTime, setEndTime] = useState<string>(() => {
    if (params.initialEndTime) {
      return params.initialEndTime.length === 5
        ? params.initialEndTime
        : params.initialEndTime.slice(11, 16)
    }
    return "10:00"
  })

  const [eventTimezone, setEventTimezone] = useState<string>(tz.timezone)
  const [recurrencePreset, setRecurrencePreset] =
    useState<RecurrenceFrequency>("none")
  const [meetUrl, setMeetUrl] = useState<string>("")
  const [sourceMailMessageId, setSourceMailMessageId] = useState<string>(
    () => params.sourceMailMessageId || ""
  )

  const [attendees, setAttendees] = useState<AttendeeFormValues[]>(() =>
    parseInitialAttendees(params.initialAttendees)
  )

  // Attendee search autocomplete state
  const [attendeeSearchQuery, setAttendeeSearchQuery] = useState("")
  const debouncedAttendeeQuery = useDebounce(attendeeSearchQuery, 250)
  const { data: suggestionsData } = useContactSuggestions(
    debouncedAttendeeQuery,
    { enabled: debouncedAttendeeQuery.trim().length > 0 }
  )
  const contactSuggestions = useMemo(
    () => suggestionsData?.contacts || [],
    [suggestionsData]
  )

  // Sheets
  const timezoneSheetRef = useRef<BottomSheet>(null)
  const recurrenceScopeSheetRef = useRef<BottomSheet>(null)
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(
    null
  )

  // Populate from existing event when loaded
  useEffect(() => {
    if (existingEvent) {
      if (existingEvent.calendarId) setCalendarId(existingEvent.calendarId)
      setTitle(existingEvent.title || "")
      setDescription(existingEvent.description || "")
      setLocation(existingEvent.location || "")
      setIsAllDay(existingEvent.isAllDay)
      setMeetUrl(existingEvent.meetUrl || "")
      setSourceMailMessageId(existingEvent.sourceMailMessageId || "")
      setEventTimezone(existingEvent.timezone || tz.timezone)

      if (existingEvent.rrule) {
        const parsed = parseRRule(existingEvent.rrule)
        setRecurrencePreset(parsed.preset)
      } else {
        setRecurrencePreset("none")
      }

      if (existingEvent.isAllDay) {
        setStartDate(existingEvent.startDate || defaultDateStr)
        setEndDate(
          toInclusiveEndDate(
            existingEvent.endDate,
            existingEvent.startDate || defaultDateStr
          )
        )
      } else {
        if (existingEvent.startTime) {
          const s = parseDate(existingEvent.startTime)
          if (s) {
            setStartDate(
              formatLocalDateString(s, existingEvent.timezone || tz.timezone)
            )
            const parts = getTimezoneParts(
              s,
              existingEvent.timezone || tz.timezone
            )
            if (parts) {
              setStartTime(
                `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
              )
            }
          }
        }
        if (existingEvent.endTime) {
          const e = parseDate(existingEvent.endTime)
          if (e) {
            setEndDate(
              formatLocalDateString(e, existingEvent.timezone || tz.timezone)
            )
            const parts = getTimezoneParts(
              e,
              existingEvent.timezone || tz.timezone
            )
            if (parts) {
              setEndTime(
                `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
              )
            }
          }
        }
      }

      if (existingEvent.attendees) {
        setAttendees(
          existingEvent.attendees.map((a) => ({
            email: a.email,
            displayName: a.displayName,
            isOptional: a.isOptional,
            responseStatus: a.responseStatus,
          }))
        )
      }
    }
  }, [existingEvent, defaultDateStr, tz.timezone])

  // Automatically select first calendar if none selected
  useEffect(() => {
    if (!calendarId && calendars.length > 0) {
      setCalendarId(calendars.find((c) => c.isEnabled)?.id || calendars[0].id)
    }
  }, [calendarId, calendars])

  // Is recurring event check
  const isRecurring = Boolean(
    existingEvent?.rrule ||
    existingEvent?.recurringMasterId ||
    params.instanceId
  )

  const handleAddAttendee = (email: string, displayName = "") => {
    if (!email.trim()) return
    haptics.selection()
    const trimmed = email.trim().toLowerCase()
    if (!attendees.some((a) => a.email.toLowerCase() === trimmed)) {
      setAttendees((prev) => [
        ...prev,
        {
          email: trimmed,
          displayName,
          isOptional: false,
          responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
        },
      ])
    }
    setAttendeeSearchQuery("")
  }

  const handleRemoveAttendee = (index: number) => {
    haptics.light()
    setAttendees((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveAttempt = () => {
    if (!title.trim()) {
      Alert.alert("Title Required", "Please enter an event title.")
      return
    }
    if (isEditMode && isRecurring) {
      setPendingAction("save")
      recurrenceScopeSheetRef.current?.expand()
      return
    }
    performSave("RECURRENCE_SCOPE_ALL_EVENTS")
  }

  const performSave = async (scope: RecurrenceScope) => {
    recurrenceScopeSheetRef.current?.close()
    haptics.light()

    const rruleStr = buildRRule(recurrencePreset)
    const effectiveCalId =
      calendarId ||
      calendars.find((c) => c.isEnabled)?.id ||
      calendars[0]?.id ||
      ""

    try {
      if (isEditMode && params.eventId) {
        const payload = {
          id: params.eventId,
          req: {
            id: params.eventId,
            updateMask: {
              paths: [
                "title",
                "description",
                "location",
                "isAllDay",
                "startTime",
                "endTime",
                "startDate",
                "endDate",
                "timezone",
                "rrule",
                "attendees",
                "meetUrl",
                "sourceMailMessageId",
                "calendarId",
              ],
            },
            recurrenceScope: scope,
            targetStartTime: isAllDay
              ? ""
              : toUtcIso(startDate, startTime, eventTimezone),
            targetStartDate: isAllDay ? startDate : "",
            event: {
              id: params.eventId,
              calendarId: effectiveCalId,
              title: title.trim(),
              description: description.trim(),
              location: location.trim(),
              isAllDay,
              startTime: isAllDay
                ? ""
                : toUtcIso(startDate, startTime, eventTimezone),
              endTime: isAllDay
                ? ""
                : toUtcIso(endDate, endTime, eventTimezone),
              startDate: isAllDay ? startDate : "",
              endDate: isAllDay ? toExclusiveEndDate(endDate) : "",
              timezone: eventTimezone,
              rrule: rruleStr,
              exdates: existingEvent?.exdates || [],
              exdatesAllDay: existingEvent?.exdatesAllDay || [],
              status: existingEvent?.status || "EVENT_STATUS_CONFIRMED",
              organizer: existingEvent?.organizer || {
                email: "",
                displayName: "",
                isSelf: true,
              },
              attendees: attendees.map((a) => ({
                email: a.email,
                displayName: a.displayName || "",
                isOptional: Boolean(a.isOptional),
                responseStatus: a.responseStatus,
                isOrganizer: false,
              })),
              reminders: existingEvent?.reminders || [],
              meetUrl: meetUrl.trim(),
              sourceMailMessageId: sourceMailMessageId.trim(),
            },
          },
        }
        await updateMutation.mutateAsync(payload)
      } else {
        await createMutation.mutateAsync({
          event: {
            id: "",
            calendarId: effectiveCalId,
            title: title.trim(),
            description: description.trim(),
            location: location.trim(),
            isAllDay,
            startTime: isAllDay
              ? ""
              : toUtcIso(startDate, startTime, eventTimezone),
            endTime: isAllDay ? "" : toUtcIso(endDate, endTime, eventTimezone),
            startDate: isAllDay ? startDate : "",
            endDate: isAllDay ? toExclusiveEndDate(endDate) : "",
            timezone: eventTimezone,
            rrule: rruleStr,
            exdates: [],
            exdatesAllDay: [],
            status: "EVENT_STATUS_CONFIRMED",
            organizer: { email: "", displayName: "", isSelf: true },
            attendees: attendees.map((a) => ({
              email: a.email,
              displayName: a.displayName || "",
              isOptional: Boolean(a.isOptional),
              responseStatus: a.responseStatus,
              isOrganizer: false,
            })),
            reminders: [],
            meetUrl: meetUrl.trim(),
            sourceMailMessageId: sourceMailMessageId.trim(),
          },
        })
      }
      haptics.success()
      router.back()
    } catch {
      haptics.error()
    }
  }

  const handleDeleteAttempt = () => {
    if (!params.eventId) return
    if (isRecurring) {
      setPendingAction("delete")
      recurrenceScopeSheetRef.current?.expand()
      return
    }
    Alert.alert("Delete Event", "Are you sure you want to delete this event?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => performDelete("RECURRENCE_SCOPE_ALL_EVENTS"),
      },
    ])
  }

  const performDelete = async (scope: RecurrenceScope) => {
    recurrenceScopeSheetRef.current?.close()
    if (!params.eventId) return
    haptics.heavy()
    try {
      await deleteMutation.mutateAsync({
        id: params.eventId,
        req: {
          id: params.eventId,
          recurrenceScope: scope,
          targetStartTime: isAllDay
            ? ""
            : toUtcIso(startDate, startTime, eventTimezone),
          targetStartDate: isAllDay ? startDate : "",
        },
      })
      haptics.success()
      router.back()
    } catch {
      haptics.error()
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: isEditMode ? "Edit Event" : "New Event",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                router.back()
              }}
              style={styles.headerBtn}
              testID="manage-event-close-btn"
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleSaveAttempt}
              disabled={isSaving}
              style={[styles.headerSaveBtn, isSaving && { opacity: 0.6 }]}
              testID="manage-event-save-btn"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text style={styles.headerSaveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Calendar Picker Strip */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Calendar</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.calendarsRow}
            >
              {calendars.map((cal) => {
                const isSelected = cal.id === calendarId
                return (
                  <TouchableOpacity
                    key={cal.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      haptics.selection()
                      setCalendarId(cal.id)
                    }}
                    style={[
                      styles.calendarPill,
                      isSelected && styles.calendarPillSelected,
                    ]}
                    testID={`manage-event-cal-${cal.id}`}
                  >
                    <View
                      style={[
                        styles.calendarDot,
                        { backgroundColor: cal.color || theme.colors.primary },
                      ]}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.calendarPillText,
                        isSelected && styles.calendarPillTextSelected,
                      ]}
                    >
                      {cal.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>

          {/* Title Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Title</Text>
            <RNTextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Add event title"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.textInput}
              testID="manage-event-title-input"
            />
          </View>

          {/* All-Day Switch */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>All-day event</Text>
            <Switch
              value={isAllDay}
              onValueChange={(val) => {
                haptics.selection()
                setIsAllDay(val)
              }}
              trackColor={{
                false: theme.colors.surfaceHighlight,
                true: theme.colors.primary,
              }}
              thumbColor="#ffffff"
              testID="manage-event-allday-switch"
            />
          </View>

          {/* Date & Time Section */}
          <View style={styles.dateTimeCard}>
            {/* Start Date & Time */}
            <View style={styles.dateTimeRow}>
              <Text style={styles.dateTimeLabel}>Starts</Text>
              <View style={styles.dateTimeInputsRow}>
                <RNTextInput
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.dateInput}
                  testID="manage-event-start-date"
                />
                {!isAllDay && (
                  <RNTextInput
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="HH:mm"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.timeInput}
                    testID="manage-event-start-time"
                  />
                )}
              </View>
            </View>

            {/* End Date & Time */}
            <View style={styles.dateTimeRow}>
              <Text style={styles.dateTimeLabel}>Ends</Text>
              <View style={styles.dateTimeInputsRow}>
                <RNTextInput
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.dateInput}
                  testID="manage-event-end-date"
                />
                {!isAllDay && (
                  <RNTextInput
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="HH:mm"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.timeInput}
                    testID="manage-event-end-time"
                  />
                )}
              </View>
            </View>

            {/* Timezone selector button (when timed) */}
            {!isAllDay && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  haptics.light()
                  timezoneSheetRef.current?.expand()
                }}
                style={styles.timezoneRow}
                testID="manage-event-tz-trigger"
              >
                <Globe size={14} color={theme.colors.textMuted} />
                <Text style={styles.timezoneText} numberOfLines={1}>
                  {eventTimezone}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Recurrence Preset Selector */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Repeat</Text>
            <View style={styles.recurrencePillsRow}>
              {(
                [
                  { id: "none", label: "Never" },
                  { id: "daily", label: "Daily" },
                  { id: "weekly", label: "Weekly" },
                  { id: "monthly", label: "Monthly" },
                  { id: "yearly", label: "Yearly" },
                ] as const
              ).map((preset) => {
                const isSelected = recurrencePreset === preset.id
                return (
                  <TouchableOpacity
                    key={preset.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      haptics.selection()
                      setRecurrencePreset(preset.id)
                    }}
                    style={[
                      styles.recurrencePill,
                      isSelected && styles.recurrencePillSelected,
                    ]}
                    testID={`manage-event-repeat-${preset.id}`}
                  >
                    <Text
                      style={[
                        styles.recurrencePillText,
                        isSelected && styles.recurrencePillTextSelected,
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Location */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Location</Text>
            <RNTextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Add physical or virtual location"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.textInput}
              testID="manage-event-location-input"
            />
          </View>

          {/* Video Conference URL */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Video Call Link</Text>
            <RNTextInput
              value={meetUrl}
              onChangeText={setMeetUrl}
              placeholder="e.g. https://meet.google.com/..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.textInput}
              autoCapitalize="none"
              testID="manage-event-meet-input"
            />
            {meetUrl.trim().length > 0 && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  haptics.light()
                  Linking.openURL(meetUrl).catch(() => {})
                }}
                style={styles.meetPreviewBtn}
              >
                <Video size={14} color={theme.colors.primary} />
                <Text style={styles.meetPreviewBtnText}>Open Video Link</Text>
                <ExternalLink size={12} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Attendees / Suggest Contacts */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Attendees</Text>
            <View style={styles.attendeeInputRow}>
              <RNTextInput
                value={attendeeSearchQuery}
                onChangeText={setAttendeeSearchQuery}
                placeholder="Add contact by name or email"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.textInput, { flex: 1 }]}
                autoCapitalize="none"
                keyboardType="email-address"
                testID="manage-event-attendee-input"
              />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleAddAttendee(attendeeSearchQuery)}
                disabled={!attendeeSearchQuery.trim()}
                style={[
                  styles.addAttendeeBtn,
                  !attendeeSearchQuery.trim() && { opacity: 0.5 },
                ]}
                testID="manage-event-attendee-add-btn"
              >
                <Plus size={16} color={theme.colors.primaryForeground} />
              </TouchableOpacity>
            </View>

            {/* Contact Suggestions Dropdown */}
            {contactSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {contactSuggestions.slice(0, 5).map((c) => (
                  <TouchableOpacity
                    key={c.id || c.email}
                    activeOpacity={0.7}
                    onPress={() =>
                      handleAddAttendee(c.email || "", c.displayName || "")
                    }
                    style={styles.suggestionRow}
                  >
                    <View style={styles.suggestionAvatar}>
                      <Text style={styles.suggestionAvatarText}>
                        {(c.displayName || c.email || "?")
                          .slice(0, 1)
                          .toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.suggestionInfo}>
                      <Text numberOfLines={1} style={styles.suggestionName}>
                        {c.displayName || c.email}
                      </Text>
                      {c.displayName && c.email ? (
                        <Text numberOfLines={1} style={styles.suggestionEmail}>
                          {c.email}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* List of Added Attendees */}
            {attendees.length > 0 && (
              <View style={styles.attendeesBadgeList}>
                {attendees.map((att, index) => (
                  <View key={att.email || index} style={styles.attendeeBadge}>
                    <Text numberOfLines={1} style={styles.attendeeBadgeText}>
                      {att.displayName || att.email}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleRemoveAttendee(index)}
                      style={styles.attendeeBadgeRemove}
                    >
                      <X size={12} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Description */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Description</Text>
            <RNTextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Notes or agenda"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.textInput, styles.textArea]}
              multiline
              numberOfLines={4}
              testID="manage-event-description-input"
            />
          </View>

          {/* Delete Action (if editing) */}
          {isEditMode && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDeleteAttempt}
              style={styles.deleteButton}
              testID="manage-event-delete-btn"
            >
              <Trash2 size={16} color={theme.colors.destructive} />
              <Text style={styles.deleteButtonText}>Delete Event</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Timezone Picker Bottom Sheet */}
      <AppBottomSheet
        ref={timezoneSheetRef}
        title="Select Timezone"
        snapPoints={["65%"]}
      >
        <ScrollView style={styles.tzList} showsVerticalScrollIndicator={false}>
          {COMMON_TIMEZONES.map((tzName) => {
            const isSelected = tzName === eventTimezone
            return (
              <TouchableOpacity
                key={tzName}
                activeOpacity={0.7}
                onPress={() => {
                  haptics.selection()
                  setEventTimezone(tzName)
                  timezoneSheetRef.current?.close()
                }}
                style={[styles.tzRow, isSelected && styles.tzRowSelected]}
              >
                <Text
                  style={[styles.tzLabel, isSelected && styles.tzLabelSelected]}
                >
                  {tzName}
                </Text>
                {isSelected && <Check size={16} color={theme.colors.primary} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </AppBottomSheet>

      {/* Recurrence Scope Action Sheet */}
      <AppBottomSheet
        ref={recurrenceScopeSheetRef}
        title="Recurring Event"
        snapPoints={["40%"]}
        onClose={() => setPendingAction(null)}
      >
        <View style={styles.scopeContainer}>
          <Text style={styles.scopePromptText}>
            {pendingAction === "delete"
              ? "Which occurrences would you like to delete?"
              : "Which occurrences would you like to update?"}
          </Text>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (pendingAction === "delete") {
                performDelete("RECURRENCE_SCOPE_THIS_EVENT")
              } else {
                performSave("RECURRENCE_SCOPE_THIS_EVENT")
              }
            }}
            style={styles.scopeButton}
            testID="manage-event-scope-this"
          >
            <Text style={styles.scopeButtonText}>This event only</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (pendingAction === "delete") {
                performDelete("RECURRENCE_SCOPE_THIS_AND_FOLLOWING")
              } else {
                performSave("RECURRENCE_SCOPE_THIS_AND_FOLLOWING")
              }
            }}
            style={styles.scopeButton}
            testID="manage-event-scope-following"
          >
            <Text style={styles.scopeButtonText}>
              This and following events
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (pendingAction === "delete") {
                performDelete("RECURRENCE_SCOPE_ALL_EVENTS")
              } else {
                performSave("RECURRENCE_SCOPE_ALL_EVENTS")
              }
            }}
            style={styles.scopeButton}
            testID="manage-event-scope-all"
          >
            <Text style={styles.scopeButtonText}>All events in series</Text>
          </TouchableOpacity>
        </View>
      </AppBottomSheet>
    </>
  )
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 48,
    gap: 16,
  },
  headerBtn: {
    padding: 6,
    borderRadius: theme.radius.full,
  },
  headerSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
  },
  headerSaveBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primaryForeground,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  calendarsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  calendarPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  calendarPillSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  calendarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calendarPillText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  calendarPillTextSelected: {
    color: theme.colors.primary,
    fontWeight: "600",
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  dateTimeCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    gap: 12,
  },
  dateTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateTimeLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  dateTimeInputsRow: {
    flexDirection: "row",
    gap: 8,
  },
  dateInput: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: theme.colors.textPrimary,
    minWidth: 105,
    textAlign: "center",
  },
  timeInput: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: theme.colors.textPrimary,
    minWidth: 65,
    textAlign: "center",
  },
  timezoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  timezoneText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  recurrencePillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  recurrencePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  recurrencePillSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  recurrencePillText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  recurrencePillTextSelected: {
    color: theme.colors.primaryForeground,
    fontWeight: "600",
  },
  meetPreviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  meetPreviewBtnText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  attendeeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addAttendeeBtn: {
    backgroundColor: theme.colors.primary,
    width: 38,
    height: 38,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionsContainer: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.md,
    marginTop: 4,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  suggestionAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceHighlight,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionAvatarText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  suggestionEmail: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  attendeesBadgeList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  attendeeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  attendeeBadgeText: {
    fontSize: 12,
    color: theme.colors.textPrimary,
    maxWidth: 200,
  },
  attendeeBadgeRemove: {
    padding: 2,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    marginTop: 12,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.destructive,
  },
  tzList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  tzRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tzRowSelected: {
    backgroundColor: theme.colors.primarySubtle,
  },
  tzLabel: {
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  tzLabelSelected: {
    color: theme.colors.primary,
    fontWeight: "600",
  },
  scopeContainer: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    gap: 12,
  },
  scopePromptText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  scopeButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  scopeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
})
