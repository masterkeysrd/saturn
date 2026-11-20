import { useState, useMemo, useEffect, useRef } from "react"
import {
  View,
  Text,
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
  useI18n,
  useCalendars,
  useGetEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useContactSuggestions,
  useDebounce,
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
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"

export type ManageEventParams = {
  eventId?: string
  instanceId?: string
  occurrenceStartTime?: string
  occurrenceStartDate?: string
  occurrenceEndTime?: string
  occurrenceEndDate?: string
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

function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

function isValidTimeString(timeStr: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return false
  const [hh, mm] = timeStr.split(":").map(Number)
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59
}

function toUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid date "${dateStr}". Expected YYYY-MM-DD.`)
  }
  if (!isValidTimeString(timeStr)) {
    throw new Error(`Invalid time "${timeStr}". Expected HH:mm.`)
  }
  const [y, m, d] = dateStr.split("-").map(Number)
  const [hh, mm] = timeStr.split(":").map(Number)
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
  if (!isValidDateString(dateStr)) {
    throw new Error(`Invalid end date "${dateStr}". Expected YYYY-MM-DD.`)
  }
  const [y, m, d] = dateStr.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0))
  const ny = String(next.getUTCFullYear()).padStart(4, "0")
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0")
  const nd = String(next.getUTCDate()).padStart(2, "0")
  return `${ny}-${nm}-${nd}`
}

function toInclusiveEndDate(dateStr: string, startDateStr: string): string {
  if (!dateStr || dateStr <= startDateStr || !isValidDateString(dateStr)) {
    return startDateStr
  }
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
  const { t } = useI18n()
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)
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
    if (params.occurrenceStartDate) return params.occurrenceStartDate
    if (params.occurrenceStartTime) {
      const p = parseDate(params.occurrenceStartTime)
      if (p) return formatLocalDateString(p, tz.timezone)
    }
    if (params.initialDate) return params.initialDate
    if (params.initialStart) {
      const p = parseDate(params.initialStart)
      if (p) return formatLocalDateString(p, tz.timezone)
    }
    return formatLocalDateString(new Date(), tz.timezone)
  }, [
    params.occurrenceStartDate,
    params.occurrenceStartTime,
    params.initialDate,
    params.initialStart,
    tz.timezone,
  ])

  const [startDate, setStartDate] = useState<string>(defaultDateStr)
  const [endDate, setEndDate] = useState<string>(() => {
    if (params.occurrenceEndDate && params.occurrenceStartDate) {
      return toInclusiveEndDate(
        params.occurrenceEndDate,
        params.occurrenceStartDate
      )
    }
    if (params.occurrenceEndTime) {
      const p = parseDate(params.occurrenceEndTime)
      if (p) return formatLocalDateString(p, tz.timezone)
    }
    return defaultDateStr
  })
  const [startTime, setStartTime] = useState<string>(() => {
    if (params.occurrenceStartTime) {
      const p = parseDate(params.occurrenceStartTime)
      if (p) {
        const parts = getTimezoneParts(p, tz.timezone)
        if (parts) {
          return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
        }
      }
    }
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
    if (params.occurrenceEndTime) {
      const p = parseDate(params.occurrenceEndTime)
      if (p) {
        const parts = getTimezoneParts(p, tz.timezone)
        if (parts) {
          return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
        }
      }
    }
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

      const targetTz = existingEvent.timezone || tz.timezone
      if (existingEvent.isAllDay) {
        const occStartDate =
          params.occurrenceStartDate ||
          existingEvent.startDate ||
          defaultDateStr
        const occEndDate =
          params.occurrenceEndDate || existingEvent.endDate || occStartDate
        setStartDate(occStartDate)
        setEndDate(toInclusiveEndDate(occEndDate, occStartDate))
      } else {
        const occStartTimeStr =
          params.occurrenceStartTime || existingEvent.startTime
        const occEndTimeStr = params.occurrenceEndTime || existingEvent.endTime
        if (occStartTimeStr) {
          const s = parseDate(occStartTimeStr)
          if (s) {
            setStartDate(formatLocalDateString(s, targetTz))
            const parts = getTimezoneParts(s, targetTz)
            if (parts) {
              setStartTime(
                `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
              )
            }
          }
        }
        if (occEndTimeStr) {
          const e = parseDate(occEndTimeStr)
          if (e) {
            setEndDate(formatLocalDateString(e, targetTz))
            const parts = getTimezoneParts(e, targetTz)
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
  }, [
    existingEvent,
    defaultDateStr,
    tz.timezone,
    params.occurrenceStartDate,
    params.occurrenceEndDate,
    params.occurrenceStartTime,
    params.occurrenceEndTime,
  ])

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
      Alert.alert(
        t("calendar.titleRequired"),
        t("calendar.titleRequiredMessage")
      )
      return
    }
    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      Alert.alert(t("calendar.invalidDate"), t("calendar.invalidDateMessage"))
      return
    }
    if (
      !isAllDay &&
      (!isValidTimeString(startTime) || !isValidTimeString(endTime))
    ) {
      Alert.alert(t("calendar.invalidTime"), t("calendar.invalidTimeMessage"))
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
      const startIso = isAllDay
        ? ""
        : toUtcIso(startDate, startTime, eventTimezone)
      const endIso = isAllDay ? "" : toUtcIso(endDate, endTime, eventTimezone)
      const exclusiveEnd = isAllDay ? toExclusiveEndDate(endDate) : ""

      if (isEditMode && params.eventId) {
        const origIsAllDay = existingEvent
          ? existingEvent.isAllDay
          : Boolean(params.occurrenceStartDate && !params.occurrenceStartTime)
        const targetStartTime = origIsAllDay
          ? ""
          : params.occurrenceStartTime || existingEvent?.startTime || startIso
        const targetStartDate = origIsAllDay
          ? params.occurrenceStartDate || existingEvent?.startDate || startDate
          : ""
        const updatePaths = [
          "title",
          "description",
          "location",
          "isAllDay",
          "startTime",
          "endTime",
          "startDate",
          "endDate",
          "timezone",
          ...(scope === "RECURRENCE_SCOPE_THIS_EVENT" ? [] : ["rrule"]),
          "attendees",
          "meetUrl",
          "sourceMailMessageId",
          "calendarId",
        ]

        const payload = {
          id: params.eventId,
          req: {
            id: params.eventId,
            updateMask: {
              paths: updatePaths,
            },
            recurrenceScope: scope,
            targetStartTime,
            targetStartDate,
            event: {
              id: params.eventId,
              calendarId: effectiveCalId,
              title: title.trim(),
              description: description.trim(),
              location: location.trim(),
              isAllDay,
              startTime: startIso,
              endTime: endIso,
              startDate: isAllDay ? startDate : "",
              endDate: exclusiveEnd,
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
            startTime: startIso,
            endTime: endIso,
            startDate: isAllDay ? startDate : "",
            endDate: exclusiveEnd,
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
    } catch (err: unknown) {
      haptics.error()
      const message =
        err instanceof Error ? err.message : t("calendar.couldNotSaveEvent")
      Alert.alert(t("calendar.saveFailed"), message)
    }
  }

  const handleDeleteAttempt = () => {
    if (!params.eventId) return
    if (isRecurring) {
      setPendingAction("delete")
      recurrenceScopeSheetRef.current?.expand()
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
          onPress: () => performDelete("RECURRENCE_SCOPE_ALL_EVENTS"),
        },
      ]
    )
  }

  const performDelete = async (scope: RecurrenceScope) => {
    recurrenceScopeSheetRef.current?.close()
    if (!params.eventId) return
    haptics.heavy()
    try {
      const origIsAllDay = existingEvent
        ? existingEvent.isAllDay
        : Boolean(params.occurrenceStartDate && !params.occurrenceStartTime)
      const targetStartTime = origIsAllDay
        ? ""
        : params.occurrenceStartTime ||
          existingEvent?.startTime ||
          toUtcIso(startDate, startTime, eventTimezone)
      const targetStartDate = origIsAllDay
        ? params.occurrenceStartDate || existingEvent?.startDate || startDate
        : ""

      await deleteMutation.mutateAsync({
        id: params.eventId,
        req: {
          id: params.eventId,
          recurrenceScope: scope,
          targetStartTime,
          targetStartDate,
        },
      })
      haptics.success()
      router.back()
    } catch (err: unknown) {
      haptics.error()
      const message =
        err instanceof Error ? err.message : t("calendar.couldNotDeleteEvent")
      Alert.alert(t("calendar.deleteFailed"), message)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: isEditMode
            ? t("calendar.editEvent")
            : t("calendar.newEvent"),
          ...(Platform.OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "button",
                    label: t("common.close"),
                    icon: { type: "sfSymbol", name: "xmark" },
                    onPress: () => {
                      haptics.light()
                      router.back()
                    },
                  },
                ],
                unstable_headerRightItems: () => [
                  isSaving
                    ? {
                        type: "custom",
                        hidesSharedBackground: true,
                        element: (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                        ),
                      }
                    : {
                        type: "button",
                        label: t("common.save"),
                        variant: "done",
                        onPress: handleSaveAttempt,
                      },
                ],
              }
            : {
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => {
                      haptics.light()
                      router.back()
                    }}
                    style={styles.headerBtn}
                    testID="manage-event-close-btn"
                  >
                    <X size={20} color={colors.textMuted} />
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
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.headerSaveBtnText}>
                        {t("common.save")}
                      </Text>
                    )}
                  </TouchableOpacity>
                ),
              }),
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
            <Text style={styles.label}>{t("calendar.calendar")}</Text>
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
                        { backgroundColor: cal.color || colors.primary },
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
            <Text style={styles.label}>{t("calendar.eventTitle")}</Text>
            <RNTextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t("calendar.addEventTitle")}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={isDark ? "dark" : "light"}
              style={styles.textInput}
              testID="manage-event-title-input"
            />
          </View>

          {/* All-Day Switch */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t("calendar.allDayEvent")}</Text>
            <Switch
              value={isAllDay}
              onValueChange={(val) => {
                haptics.selection()
                setIsAllDay(val)
              }}
              trackColor={{
                false: colors.surfaceHighlight,
                true: colors.primary,
              }}
              thumbColor="#ffffff"
              testID="manage-event-allday-switch"
            />
          </View>

          {/* Date & Time Section */}
          <View style={styles.dateTimeCard}>
            {/* Start Date & Time */}
            <View style={styles.dateTimeRow}>
              <Text style={styles.dateTimeLabel}>{t("calendar.starts")}</Text>
              <View style={styles.dateTimeInputsRow}>
                <RNTextInput
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                  style={styles.dateInput}
                  testID="manage-event-start-date"
                />
                {!isAllDay && (
                  <RNTextInput
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="HH:mm"
                    placeholderTextColor={colors.textMuted}
                    keyboardAppearance={isDark ? "dark" : "light"}
                    style={styles.timeInput}
                    testID="manage-event-start-time"
                  />
                )}
              </View>
            </View>

            {/* End Date & Time */}
            <View style={styles.dateTimeRow}>
              <Text style={styles.dateTimeLabel}>{t("calendar.ends")}</Text>
              <View style={styles.dateTimeInputsRow}>
                <RNTextInput
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={isDark ? "dark" : "light"}
                  style={styles.dateInput}
                  testID="manage-event-end-date"
                />
                {!isAllDay && (
                  <RNTextInput
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="HH:mm"
                    placeholderTextColor={colors.textMuted}
                    keyboardAppearance={isDark ? "dark" : "light"}
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
                <Globe size={14} color={colors.textMuted} />
                <Text style={styles.timezoneText} numberOfLines={1}>
                  {eventTimezone}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Recurrence Preset Selector */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t("calendar.repeat")}</Text>
            <View style={styles.recurrencePillsRow}>
              {(
                [
                  { id: "none", label: t("calendar.never") },
                  { id: "daily", label: t("calendar.daily") },
                  { id: "weekly", label: t("calendar.weekly") },
                  { id: "monthly", label: t("calendar.monthly") },
                  { id: "yearly", label: t("calendar.yearly") },
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
            <Text style={styles.label}>{t("calendar.location")}</Text>
            <RNTextInput
              value={location}
              onChangeText={setLocation}
              placeholder={t("calendar.addLocationMobile")}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={isDark ? "dark" : "light"}
              style={styles.textInput}
              testID="manage-event-location-input"
            />
          </View>

          {/* Video Conference URL */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              {t("calendar.videoCallLinkMobile")}
            </Text>
            <RNTextInput
              value={meetUrl}
              onChangeText={setMeetUrl}
              placeholder={t("calendar.videoCallPlaceholderMobile")}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={isDark ? "dark" : "light"}
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
                <Video size={14} color={colors.primary} />
                <Text style={styles.meetPreviewBtnText}>
                  {t("calendar.openVideoLink")}
                </Text>
                <ExternalLink size={12} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Attendees / Suggest Contacts */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t("calendar.attendees")}</Text>
            <View style={styles.attendeeInputRow}>
              <RNTextInput
                value={attendeeSearchQuery}
                onChangeText={setAttendeeSearchQuery}
                placeholder={t("calendar.addAttendeeMobile")}
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? "dark" : "light"}
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
                <Plus size={16} color={colors.primaryForeground} />
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
                      <X size={12} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Description */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t("calendar.descriptionMobile")}</Text>
            <RNTextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t("calendar.descriptionPlaceholderMobile")}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={isDark ? "dark" : "light"}
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
              <Trash2 size={16} color={colors.destructive} />
              <Text style={styles.deleteButtonText}>
                {t("calendar.deleteEvent")}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Timezone Picker Bottom Sheet */}
      <AppBottomSheet
        ref={timezoneSheetRef}
        title={t("calendar.selectTimezone")}
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
                {isSelected && <Check size={16} color={colors.primary} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </AppBottomSheet>

      {/* Recurrence Scope Action Sheet */}
      <AppBottomSheet
        ref={recurrenceScopeSheetRef}
        title={t("calendar.recurringEvent")}
        snapPoints={["40%"]}
        onClose={() => setPendingAction(null)}
      >
        <View style={styles.scopeContainer}>
          <Text style={styles.scopePromptText}>
            {pendingAction === "delete"
              ? t("calendar.recurringDeletePrompt")
              : t("calendar.recurringUpdatePrompt")}
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
            <Text style={styles.scopeButtonText}>
              {t("calendar.thisEventOnly")}
            </Text>
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
              {t("calendar.thisAndFollowingEvents")}
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
            <Text style={styles.scopeButtonText}>
              {t("calendar.allEventsInSeries")}
            </Text>
          </TouchableOpacity>
        </View>
      </AppBottomSheet>
    </>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  keyboardView: {
    flex: 1,
    backgroundColor: t.colors.background,
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
    borderRadius: t.radius.full,
  },
  headerSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: t.colors.primary,
    borderRadius: t.radius.sm,
  },
  headerSaveBtnText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  calendarsRow: {
    flexDirection: "row" as const,
    gap: 8,
    paddingVertical: 2,
  },
  calendarPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  calendarPillSelected: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  calendarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calendarPillText: {
    fontSize: 13,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  calendarPillTextSelected: {
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
  textInput: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: t.colors.textPrimary,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top" as const,
  },
  switchRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
  },
  dateTimeCard: {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    padding: 12,
    gap: 12,
  },
  dateTimeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  dateTimeLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
  },
  dateTimeInputsRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  dateInput: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: t.colors.textPrimary,
    minWidth: 105,
    textAlign: "center" as const,
  },
  timeInput: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: t.colors.textPrimary,
    minWidth: 65,
    textAlign: "center" as const,
  },
  timezoneRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  timezoneText: {
    fontSize: 12,
    color: t.colors.primary,
    fontWeight: "500" as const,
  },
  recurrencePillsRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  recurrencePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  recurrencePillSelected: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  recurrencePillText: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
  },
  recurrencePillTextSelected: {
    color: t.colors.primaryForeground,
    fontWeight: "600" as const,
  },
  meetPreviewBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 4,
  },
  meetPreviewBtnText: {
    fontSize: 12,
    color: t.colors.primary,
    fontWeight: "500" as const,
  },
  attendeeInputRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  addAttendeeBtn: {
    backgroundColor: t.colors.primary,
    width: 38,
    height: 38,
    borderRadius: t.radius.md,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  suggestionsContainer: {
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    borderRadius: t.radius.md,
    marginTop: 4,
    overflow: "hidden" as const,
  },
  suggestionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    gap: 8,
  },
  suggestionAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: t.colors.surfaceHighlight,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  suggestionAvatarText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 13,
    color: t.colors.textPrimary,
    fontWeight: "500" as const,
  },
  suggestionEmail: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  attendeesBadgeList: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
    marginTop: 6,
  },
  attendeeBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: t.radius.sm,
  },
  attendeeBadgeText: {
    fontSize: 12,
    color: t.colors.textPrimary,
    maxWidth: 200,
  },
  attendeeBadgeRemove: {
    padding: 2,
  },
  deleteButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: t.colors.destructive,
    marginTop: 12,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.destructive,
  },
  tzList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  tzRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  tzRowSelected: {
    backgroundColor: t.colors.primarySubtle,
  },
  tzLabel: {
    fontSize: 14,
    color: t.colors.textPrimary,
  },
  tzLabelSelected: {
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
  scopeContainer: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    gap: 12,
  },
  scopePromptText: {
    fontSize: 14,
    color: t.colors.textSecondary,
    marginBottom: 4,
  },
  scopeButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
  },
  scopeButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
})
