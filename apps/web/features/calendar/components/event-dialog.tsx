import { useState, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useTimezone,
  useCalendars,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useRespondToEvent,
  useContactSuggestions,
} from "@saturn/hooks"
import {
  buildRRule,
  parseRRule,
  type RecurrenceFrequency,
  type AttendeeFormValues,
} from "@saturn/schemas"
import type {
  Event,
  EventOccurrence,
  Calendar,
  RecurrenceScope,
  AttendeeResponseStatus,
} from "@saturn/api/saturn/calendar/v1/calendar"
import { Calendar as CalendarUI } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RecurrenceScopeDialog } from "./recurrence-scope-dialog"
import { TimezoneCombobox } from "./timezone-combobox"
import {
  Calendar as CalendarIcon,
  ChevronDownIcon,
  Clock,
  MapPin,
  Video,
  Users,
  Repeat,
  Trash2,
  ExternalLink,
  X,
  Check,
  HelpCircle,
} from "lucide-react"

export interface EventDialogProps {
  open: boolean
  onClose: () => void
  initialDate?: string // YYYY-MM-DD
  initialStartTime?: string // ISO timestamp or HH:mm
  initialEndTime?: string // ISO timestamp or HH:mm
  initialCalendarId?: string
  initialValues?: Partial<Event> & {
    occurrence?: EventOccurrence
    sourceMailMessageId?: string
  }
}

interface FormState {
  calendarId: string
  title: string
  description: string
  location: string
  isAllDay: boolean
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  timezone: string
  recurrencePreset: RecurrenceFrequency
  meetUrl: string
  attendees: AttendeeFormValues[]
  sourceMailMessageId: string
}

function parseYMD(ymd: string): { year: number; month: number; day: number } {
  const [year, month, day] = ymd.split("-").map(Number)
  return { year: year || 2026, month: month || 1, day: day || 1 }
}

function ymdToNoonUtc(ymd: string): Date {
  const { year, month, day } = parseYMD(ymd)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

function ymdToLocalDate(ymd: string): Date {
  const { year, month, day } = parseYMD(ymd)
  return new Date(year, month - 1, day)
}

function localDateToYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function dateToUtcYMD(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDaysToYMD(ymd: string, days: number): string {
  const noon = ymdToNoonUtc(ymd)
  const shifted = new Date(noon.getTime() + days * 86_400_000)
  return dateToUtcYMD(shifted)
}

function diffDaysYMD(start: string, end: string): number {
  const s = ymdToNoonUtc(start).getTime()
  const e = ymdToNoonUtc(end).getTime()
  return Math.round((e - s) / 86_400_000)
}

const RECURRENCE_LABELS: Record<RecurrenceFrequency, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom",
}

interface EventDialogFormProps {
  initialForm: FormState
  occurrence?: EventOccurrence
  calendars: Calendar[]
  onClose: () => void
}

function EventDialogForm({
  initialForm,
  occurrence,
  calendars,
  onClose,
}: EventDialogFormProps) {
  const tz = useTimezone()
  const createEventMutation = useCreateEvent()
  const updateEventMutation = useUpdateEvent()
  const deleteEventMutation = useDeleteEvent()
  const respondMutation = useRespondToEvent()

  const [calendarId, setCalendarId] = useState(initialForm.calendarId)
  const selectedCalendar = useMemo(
    () => calendars.find((c) => c.id === calendarId),
    [calendars, calendarId]
  )
  const [title, setTitle] = useState(initialForm.title)
  const [description, setDescription] = useState(initialForm.description)
  const [location, setLocation] = useState(initialForm.location)
  const [isAllDay, setIsAllDay] = useState(initialForm.isAllDay)
  const [startDate, setStartDate] = useState(initialForm.startDate)
  const [endDate, setEndDate] = useState(initialForm.endDate)
  const [startTime, setStartTime] = useState(initialForm.startTime)
  const [endTime, setEndTime] = useState(initialForm.endTime)
  const [timezone, setTimezone] = useState(initialForm.timezone)
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrenceFrequency>(
    initialForm.recurrencePreset
  )
  const [meetUrl, setMeetUrl] = useState(initialForm.meetUrl)
  const [attendees, setAttendees] = useState<AttendeeFormValues[]>(
    initialForm.attendees
  )
  const [attendeeInput, setAttendeeInput] = useState("")
  const [sourceMailMessageId] = useState(initialForm.sourceMailMessageId)

  // Date popover states
  const [startDateOpen, setStartDateOpen] = useState(false)
  const [endDateOpen, setEndDateOpen] = useState(false)

  const startDatePickerDate = useMemo(() => {
    if (!startDate) return undefined
    return ymdToLocalDate(startDate)
  }, [startDate])

  const endDatePickerDate = useMemo(() => {
    if (!endDate) return undefined
    return ymdToLocalDate(endDate)
  }, [endDate])

  // Automatically adjust End date when Start date changes to keep interval valid
  const handleStartDateChange = (newStartStr: string) => {
    setStartDate(newStartStr)
    if (!newStartStr) return

    if (startDate && endDate) {
      const diffDays = Math.max(0, diffDaysYMD(startDate, endDate))
      const newEndStr = addDaysToYMD(newStartStr, diffDays)
      setEndDate(newEndStr)
    } else if (!endDate || endDate < newStartStr) {
      setEndDate(newStartStr)
    }
  }

  // If End date is set before Start date, adjust Start date to match
  const handleEndDateChange = (newEndStr: string) => {
    setEndDate(newEndStr)
    if (!newEndStr) return

    if (startDate && newEndStr < startDate) {
      setStartDate(newEndStr)
    }
  }

  // Automatically adjust End time when Start time changes to preserve meeting duration
  const handleStartTimeChange = (newStartTime: string) => {
    setStartTime(newStartTime)
    if (!newStartTime || !newStartTime.includes(":")) return

    if (startDate === endDate && startTime && endTime) {
      const [sh, sm] = startTime.split(":").map(Number)
      const [eh, em] = endTime.split(":").map(Number)
      const prevDurationMin = Math.max(15, eh * 60 + em - (sh * 60 + sm))

      const [newSh, newSm] = newStartTime.split(":").map(Number)
      const newStartTotalMin = newSh * 60 + newSm
      const newEndTotalMin = newStartTotalMin + prevDurationMin

      const nextEh = Math.min(23, Math.floor(newEndTotalMin / 60))
      const nextEm = newEndTotalMin % 60
      const nextEndTime = `${String(nextEh).padStart(2, "0")}:${String(nextEm).padStart(2, "0")}`

      setEndTime(nextEndTime)
    }
  }

  const handleEndTimeChange = (newEndTime: string) => {
    setEndTime(newEndTime)
    if (!newEndTime || !newEndTime.includes(":")) return

    if (startDate === endDate && startTime) {
      const [sh, sm] = startTime.split(":").map(Number)
      const [eh, em] = newEndTime.split(":").map(Number)
      if (eh * 60 + em < sh * 60 + sm) {
        const newStartH = Math.max(0, eh - 1)
        setStartTime(
          `${String(newStartH).padStart(2, "0")}:${String(em).padStart(2, "0")}`
        )
      }
    }
  }

  // Recurrence scope dialog state
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false)
  const [scopeAction, setScopeAction] = useState<"edit" | "delete">("edit")

  // Contact suggestions
  const { data: contactSuggestions } = useContactSuggestions(attendeeInput, {
    enabled: attendeeInput.trim().length > 1,
  })

  const handleAddAttendee = (emailToAdd?: string) => {
    const raw = (emailToAdd || attendeeInput).trim().toLowerCase()
    if (!raw || !raw.includes("@")) return

    if (attendees.some((a) => a.email.toLowerCase() === raw)) {
      setAttendeeInput("")
      return
    }

    setAttendees((prev) => [
      ...prev,
      {
        email: raw,
        displayName: raw.split("@")[0],
        isOptional: false,
        responseStatus: "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
      },
    ])
    setAttendeeInput("")
  }

  const handleRemoveAttendee = (emailToRemove: string) => {
    setAttendees((prev) => prev.filter((a) => a.email !== emailToRemove))
  }

  const handleSave = async (scope?: RecurrenceScope) => {
    if (!title.trim()) {
      toast.add({ title: "Title is required", type: "error" })
      return
    }
    if (!calendarId) {
      toast.add({ title: "Please select a calendar", type: "error" })
      return
    }

    const isRecurring = Boolean(occurrence?.masterId)
    if (occurrence && isRecurring && !scope) {
      setScopeAction("edit")
      setScopeDialogOpen(true)
      return
    }

    let startIso = ""
    let endIso = ""

    if (!isAllDay) {
      if (!startDate || !startTime || !endDate || !endTime) {
        toast.add({
          title: "Please enter valid start and end times",
          type: "error",
        })
        return
      }
      const s = new Date(`${startDate}T${startTime}:00`)
      const e = new Date(`${endDate}T${endTime}:00`)
      if (e.getTime() < s.getTime()) {
        toast.add({
          title: "End time cannot be earlier than start time",
          type: "error",
        })
        return
      }
      startIso = s.toISOString()
      endIso = e.toISOString()
    } else {
      if (!startDate || !endDate) {
        toast.add({
          title: "Please enter valid start and end dates",
          type: "error",
        })
        return
      }
      if (endDate < startDate) {
        toast.add({
          title: "End date must be on or after start date",
          type: "error",
        })
        return
      }
    }

    const rrule = buildRRule(recurrencePreset)

    const mappedAttendees = attendees.map((a) => ({
      email: a.email,
      displayName: a.displayName || "",
      isOptional: a.isOptional ?? false,
      isOrganizer: false,
      responseStatus:
        a.responseStatus || "ATTENDEE_RESPONSE_STATUS_NEEDS_ACTION",
    }))

    try {
      if (occurrence) {
        await updateEventMutation.mutateAsync({
          id: occurrence.eventId,
          req: {
            id: occurrence.eventId,
            event: {
              id: occurrence.eventId,
              calendarId,
              title,
              description,
              location,
              isAllDay,
              startTime: startIso,
              endTime: endIso,
              startDate: isAllDay ? startDate : "",
              endDate: isAllDay ? endDate : "",
              timezone,
              rrule,
              exdates: [],
              exdatesAllDay: [],
              status: "EVENT_STATUS_CONFIRMED",
              organizer: occurrence.organizer || {
                email: "",
                displayName: "",
                isSelf: true,
              },
              attendees: mappedAttendees,
              reminders: occurrence.reminders || [],
              meetUrl,
              sourceMailMessageId:
                sourceMailMessageId ||
                (occurrence as unknown as { sourceMailMessageId?: string })
                  ?.sourceMailMessageId ||
                "",
            },
            updateMask: {
              paths: [
                "title",
                "description",
                "location",
                "is_all_day",
                "start_time",
                "end_time",
                "start_date",
                "end_date",
                "timezone",
                "rrule",
                "attendees",
                "meet_url",
              ],
            },
            recurrenceScope: scope || "RECURRENCE_SCOPE_ALL_EVENTS",
            targetStartTime: occurrence.startTime || "",
            targetStartDate: occurrence.startDate || "",
          },
        })
        toast.add({ title: "Event updated", type: "success" })
      } else {
        await createEventMutation.mutateAsync({
          event: {
            id: "",
            calendarId,
            title,
            description,
            location,
            isAllDay,
            startTime: startIso,
            endTime: endIso,
            startDate: isAllDay ? startDate : "",
            endDate: isAllDay ? endDate : "",
            timezone,
            rrule,
            exdates: [],
            exdatesAllDay: [],
            status: "EVENT_STATUS_CONFIRMED",
            organizer: { email: "", displayName: "", isSelf: true },
            attendees: mappedAttendees,
            reminders: [{ method: "popup", minutes: 10 }],
            meetUrl,
            sourceMailMessageId,
          },
        })
        toast.add({ title: "Event created", type: "success" })
      }
      onClose()
    } catch (err) {
      toast.add({
        title: "Failed to save event",
        description: err instanceof Error ? err.message : "An error occurred",
        type: "error",
      })
    }
  }

  const handleDelete = async (scope?: RecurrenceScope) => {
    if (!occurrence) return

    const isRecurring = Boolean(occurrence.masterId)
    if (isRecurring && !scope) {
      setScopeAction("delete")
      setScopeDialogOpen(true)
      return
    }

    try {
      await deleteEventMutation.mutateAsync({
        id: occurrence.eventId,
        req: {
          recurrenceScope: scope || "RECURRENCE_SCOPE_ALL_EVENTS",
          targetStartTime: occurrence.startTime || "",
          targetStartDate: occurrence.startDate || "",
        },
      })
      toast.add({ title: "Event deleted", type: "success" })
      onClose()
    } catch (err) {
      toast.add({
        title: "Failed to delete event",
        description: err instanceof Error ? err.message : "An error occurred",
        type: "error",
      })
    }
  }

  const handleRSVP = async (response: AttendeeResponseStatus) => {
    if (!occurrence) return
    try {
      await respondMutation.mutateAsync({
        id: occurrence.eventId,
        response,
      })
      toast.add({ title: "RSVP updated", type: "success" })
    } catch (err) {
      toast.add({
        title: "Failed to update RSVP",
        description: err instanceof Error ? err.message : "An error occurred",
        type: "error",
      })
    }
  }

  return (
    <>
      <div className="space-y-4 py-2">
        {/* Title */}
        <div>
          <Label htmlFor="event-title" className="text-xs font-medium">
            Event Title *
          </Label>
          <Input
            id="event-title"
            data-testid="event-title-input"
            placeholder="Add title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-9 rounded-4xl border-input bg-input/30 text-sm font-medium"
          />
        </div>

        {/* Calendar Selector */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="calendar-select" className="text-xs font-medium">
              Calendar
            </Label>
            <div className="mt-1">
              <Select
                value={calendarId}
                onValueChange={(val) => val && setCalendarId(val)}
              >
                <SelectTrigger
                  id="calendar-select"
                  data-testid="calendar-select"
                >
                  <SelectValue placeholder="Select calendar">
                    {selectedCalendar ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              selectedCalendar.color || "#3b82f6",
                          }}
                        />
                        <span>{selectedCalendar.name}</span>
                      </div>
                    ) : (
                      "Select calendar"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="z-50">
                  {calendars.map((cal) => (
                    <SelectItem key={cal.id} value={cal.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: cal.color || "#3b82f6" }}
                        />
                        <span>{cal.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Timezone Selector */}
          <div>
            <Label htmlFor="timezone-select" className="text-xs font-medium">
              Timezone
            </Label>
            <div className="mt-1">
              <TimezoneCombobox value={timezone} onChange={setTimezone} />
            </div>
          </div>
        </div>

        {/* All-Day Switch */}
        <div className="flex items-center justify-between rounded-4xl border border-input bg-input/20 px-4 py-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="all-day-switch" className="cursor-pointer text-sm">
              All-day event
            </Label>
          </div>
          <Switch
            id="all-day-switch"
            data-testid="all-day-switch"
            checked={isAllDay}
            onCheckedChange={setIsAllDay}
          />
        </div>

        {/* Date / Time Inputs */}
        {isAllDay ? (
          <div className="space-y-3">
            <div>
              <Label
                htmlFor="start-date"
                className="text-xs text-muted-foreground"
              >
                Start Date
              </Label>
              <div className="mt-1">
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        id="start-date"
                        data-testid="start-date-picker-trigger"
                        className="flex h-9 w-full items-center justify-between rounded-4xl border-input bg-input/30 px-3 text-left text-sm font-normal shadow-xs transition hover:bg-input/50"
                      >
                        <div className="flex min-w-0 items-center gap-2 truncate">
                          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {startDate
                              ? tz.format(ymdToNoonUtc(startDate), {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "Select date"}
                          </span>
                        </div>
                        <ChevronDownIcon
                          className="h-4 w-4 shrink-0 opacity-50"
                          data-icon="inline-end"
                        />
                      </Button>
                    }
                  />
                  <PopoverContent
                    className="z-50 w-auto overflow-hidden rounded-xl border border-border/60 bg-popover p-0 shadow-lg"
                    align="start"
                  >
                    <CalendarUI
                      mode="single"
                      selected={startDatePickerDate}
                      captionLayout="dropdown"
                      defaultMonth={startDatePickerDate}
                      onSelect={(d) => {
                        if (d) {
                          const str = localDateToYMD(d)
                          handleStartDateChange(str)
                          setStartDateOpen(false)
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <input
                  type="text"
                  className="sr-only"
                  data-testid="start-date-input"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label
                htmlFor="end-date"
                className="text-xs text-muted-foreground"
              >
                End Date (Inclusive)
              </Label>
              <div className="mt-1">
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        id="end-date"
                        data-testid="end-date-picker-trigger"
                        className="flex h-9 w-full items-center justify-between rounded-4xl border-input bg-input/30 px-3 text-left text-sm font-normal shadow-xs transition hover:bg-input/50"
                      >
                        <div className="flex min-w-0 items-center gap-2 truncate">
                          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {endDate
                              ? tz.format(ymdToNoonUtc(endDate), {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "Select date"}
                          </span>
                        </div>
                        <ChevronDownIcon
                          className="h-4 w-4 shrink-0 opacity-50"
                          data-icon="inline-end"
                        />
                      </Button>
                    }
                  />
                  <PopoverContent
                    className="z-50 w-auto overflow-hidden rounded-xl border border-border/60 bg-popover p-0 shadow-lg"
                    align="start"
                  >
                    <CalendarUI
                      mode="single"
                      selected={endDatePickerDate}
                      captionLayout="dropdown"
                      defaultMonth={endDatePickerDate || startDatePickerDate}
                      disabled={
                        startDatePickerDate
                          ? { before: startDatePickerDate }
                          : undefined
                      }
                      onSelect={(d) => {
                        if (d) {
                          const str = localDateToYMD(d)
                          handleEndDateChange(str)
                          setEndDateOpen(false)
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <input
                  type="text"
                  className="sr-only"
                  data-testid="end-date-input"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label
                htmlFor="start-date"
                className="text-xs text-muted-foreground"
              >
                Starts
              </Label>
              <div className="flex items-center gap-2.5">
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        id="start-date"
                        data-testid="start-date-picker-trigger"
                        className="flex h-9 min-w-0 flex-1 items-center justify-between rounded-4xl border-input bg-input/30 px-3 text-left text-sm font-normal shadow-xs transition hover:bg-input/50"
                      >
                        <div className="flex min-w-0 items-center gap-2 truncate">
                          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {startDate
                              ? tz.format(ymdToNoonUtc(startDate), {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "Select date"}
                          </span>
                        </div>
                        <ChevronDownIcon
                          className="h-4 w-4 shrink-0 opacity-50"
                          data-icon="inline-end"
                        />
                      </Button>
                    }
                  />
                  <PopoverContent
                    className="z-50 w-auto overflow-hidden rounded-xl border border-border/60 bg-popover p-0 shadow-lg"
                    align="start"
                  >
                    <CalendarUI
                      mode="single"
                      selected={startDatePickerDate}
                      captionLayout="dropdown"
                      defaultMonth={startDatePickerDate}
                      onSelect={(d) => {
                        if (d) {
                          const str = localDateToYMD(d)
                          handleStartDateChange(str)
                          setStartDateOpen(false)
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <input
                  type="text"
                  className="sr-only"
                  data-testid="start-date-input"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
                <Input
                  data-testid="start-time-input"
                  type="time"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="h-9 w-32 shrink-0 appearance-none rounded-4xl border-input bg-input/30 text-sm sm:w-36 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="end-date"
                className="text-xs text-muted-foreground"
              >
                Ends
              </Label>
              <div className="flex items-center gap-2.5">
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        id="end-date"
                        data-testid="end-date-picker-trigger"
                        className="flex h-9 min-w-0 flex-1 items-center justify-between rounded-4xl border-input bg-input/30 px-3 text-left text-sm font-normal shadow-xs transition hover:bg-input/50"
                      >
                        <div className="flex min-w-0 items-center gap-2 truncate">
                          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {endDate
                              ? tz.format(ymdToNoonUtc(endDate), {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "Select date"}
                          </span>
                        </div>
                        <ChevronDownIcon
                          className="h-4 w-4 shrink-0 opacity-50"
                          data-icon="inline-end"
                        />
                      </Button>
                    }
                  />
                  <PopoverContent
                    className="z-50 w-auto overflow-hidden rounded-xl border border-border/60 bg-popover p-0 shadow-lg"
                    align="start"
                  >
                    <CalendarUI
                      mode="single"
                      selected={endDatePickerDate}
                      captionLayout="dropdown"
                      defaultMonth={endDatePickerDate || startDatePickerDate}
                      disabled={
                        startDatePickerDate
                          ? { before: startDatePickerDate }
                          : undefined
                      }
                      onSelect={(d) => {
                        if (d) {
                          const str = localDateToYMD(d)
                          handleEndDateChange(str)
                          setEndDateOpen(false)
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <input
                  type="text"
                  className="sr-only"
                  data-testid="end-date-input"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                />
                <Input
                  data-testid="end-time-input"
                  type="time"
                  value={endTime}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  className="h-9 w-32 shrink-0 appearance-none rounded-4xl border-input bg-input/30 text-sm sm:w-36 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Recurrence Picker */}
        <div>
          <Label
            htmlFor="recurrence-select"
            className="flex items-center gap-1.5 text-xs font-medium"
          >
            <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
            Repeat
          </Label>
          <div className="mt-1">
            <Select
              value={recurrencePreset}
              onValueChange={(val) =>
                val && setRecurrencePreset(val as RecurrenceFrequency)
              }
            >
              <SelectTrigger
                id="recurrence-select"
                data-testid="recurrence-select"
              >
                <SelectValue placeholder="Does not repeat">
                  {RECURRENCE_LABELS[recurrencePreset] || "Does not repeat"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-50">
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Video Call Link */}
        <div>
          <Label
            htmlFor="meet-url"
            className="flex items-center gap-1.5 text-xs font-medium"
          >
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
            Conference / Meeting Link
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="meet-url"
              data-testid="meet-url-input"
              placeholder="https://meet.google.com/... or Zoom link"
              value={meetUrl}
              onChange={(e) => setMeetUrl(e.target.value)}
              className="h-9 rounded-4xl border-input bg-input/30 text-sm"
            />
            {meetUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 rounded-4xl border-input bg-input/30 hover:bg-input/50"
                onClick={() => window.open(meetUrl, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Join
              </Button>
            )}
          </div>
        </div>

        {/* Location */}
        <div>
          <Label
            htmlFor="location-input"
            className="flex items-center gap-1.5 text-xs font-medium"
          >
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Location
          </Label>
          <Input
            id="location-input"
            data-testid="location-input"
            placeholder="Physical location or conference room"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 h-9 rounded-4xl border-input bg-input/30 text-sm"
          />
        </div>

        {/* Attendees Autocomplete & Chips */}
        <div>
          <Label
            htmlFor="attendees-input"
            className="flex items-center gap-1.5 text-xs font-medium"
          >
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            Attendees
          </Label>
          <div className="relative mt-1">
            <Input
              id="attendees-input"
              data-testid="attendees-input"
              placeholder="Add attendee by email..."
              value={attendeeInput}
              onChange={(e) => setAttendeeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  handleAddAttendee()
                }
              }}
              className="h-9 rounded-4xl border-input bg-input/30 text-sm"
            />

            {/* Suggestions drop-down */}
            {contactSuggestions?.contacts &&
              contactSuggestions.contacts.length > 0 &&
              attendeeInput.trim().length > 1 && (
                <div className="absolute top-full z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-md">
                  {contactSuggestions.contacts.map((contact) => (
                    <button
                      key={contact.email}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted"
                      onClick={() => handleAddAttendee(contact.email)}
                    >
                      <div>
                        <div className="font-medium text-foreground">
                          {contact.displayName || contact.email}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {contact.email}
                        </div>
                      </div>
                      <span className="text-[10px] text-primary">Add</span>
                    </button>
                  ))}
                </div>
              )}
          </div>

          {/* Attendee chips */}
          {attendees.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attendees.map((att) => (
                <span
                  key={att.email}
                  data-testid={`attendee-chip-${att.email}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  <span>{att.displayName || att.email}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttendee(att.email)}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <Label htmlFor="description-input" className="text-xs font-medium">
            Description / Notes
          </Label>
          <Textarea
            id="description-input"
            data-testid="description-input"
            placeholder="Meeting agenda, notes, or details..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 rounded-xl border-input bg-input/30 text-sm"
          />
        </div>

        {/* RSVP Controls for participant */}
        {occurrence && (
          <div className="rounded-xl border border-input/60 bg-input/20 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              Going?
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 rounded-xl border-input bg-input/30 text-xs hover:bg-input/50"
                onClick={() => handleRSVP("ATTENDEE_RESPONSE_STATUS_ACCEPTED")}
              >
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                Yes
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 rounded-xl border-input bg-input/30 text-xs hover:bg-input/50"
                onClick={() => handleRSVP("ATTENDEE_RESPONSE_STATUS_TENTATIVE")}
              >
                <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
                Maybe
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 rounded-xl border-input bg-input/30 text-xs hover:bg-input/50"
                onClick={() => handleRSVP("ATTENDEE_RESPONSE_STATUS_DECLINED")}
              >
                <X className="h-3.5 w-3.5 text-rose-500" />
                No
              </Button>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="flex items-center justify-between sm:justify-between">
        {occurrence ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            data-testid="delete-event-btn"
            onClick={() => handleDelete()}
            className="gap-1.5"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="save-event-btn"
            onClick={() => handleSave()}
            disabled={
              createEventMutation.isPending || updateEventMutation.isPending
            }
          >
            Save
          </Button>
        </div>
      </DialogFooter>

      {/* Recurrence Scope Choice Modal */}
      <RecurrenceScopeDialog
        open={scopeDialogOpen}
        action={scopeAction}
        onClose={() => setScopeDialogOpen(false)}
        onConfirm={(scope) => {
          if (scopeAction === "edit") {
            handleSave(scope)
          } else {
            handleDelete(scope)
          }
        }}
      />
    </>
  )
}

export function EventDialog({
  open,
  onClose,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialCalendarId,
  initialValues,
}: EventDialogProps) {
  const tz = useTimezone()
  const { data: calendarsData } = useCalendars()
  const calendars = useMemo(
    () => calendarsData?.calendars || [],
    [calendarsData]
  )
  const occurrence = initialValues?.occurrence

  const initialForm = useMemo<FormState>(() => {
    if (occurrence) {
      let sDate = ""
      let eDate = ""
      let sTime = "09:00"
      let eTime = "10:00"

      if (occurrence.isAllDay) {
        sDate = occurrence.startDate || ""
        eDate =
          occurrence.endDate &&
          occurrence.endDate >= (occurrence.startDate || "")
            ? occurrence.endDate
            : occurrence.startDate || ""
      } else {
        const sParts = tz.parts(occurrence.startTime)
        const eParts = tz.parts(occurrence.endTime)
        if (sParts) {
          const sy = String(sParts.year).padStart(4, "0")
          const sm = String(sParts.month).padStart(2, "0")
          const sd = String(sParts.day).padStart(2, "0")
          sDate = `${sy}-${sm}-${sd}`
          sTime = `${String(sParts.hour).padStart(2, "0")}:${String(sParts.minute).padStart(2, "0")}`
        }
        if (eParts) {
          const ey = String(eParts.year).padStart(4, "0")
          const em = String(eParts.month).padStart(2, "0")
          const ed = String(eParts.day).padStart(2, "0")
          eDate = `${ey}-${em}-${ed}`
          eTime = `${String(eParts.hour).padStart(2, "0")}:${String(eParts.minute).padStart(2, "0")}`
        }
      }

      return {
        calendarId:
          occurrence.calendarId || initialCalendarId || calendars[0]?.id || "",
        title: occurrence.title || "",
        description: occurrence.description || "",
        location: occurrence.location || "",
        isAllDay: occurrence.isAllDay,
        startDate: sDate,
        endDate: eDate,
        startTime: sTime,
        endTime: eTime,
        timezone: occurrence.timezone || tz.timezone || "UTC",
        recurrencePreset: (initialValues?.rrule
          ? parseRRule(initialValues.rrule).preset
          : "none") as RecurrenceFrequency,
        meetUrl: occurrence.meetUrl || "",
        attendees: (occurrence.attendees as AttendeeFormValues[]) || [],
        sourceMailMessageId: initialValues?.sourceMailMessageId || "",
      }
    }

    const defaultDate =
      initialDate || tz.formatDate(tz.now(), { dateStyle: "short" })
    const parts = tz.parts(initialDate ? tz.startOfDay(initialDate) : tz.now())
    const dateStr = parts
      ? `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
      : defaultDate

    return {
      calendarId: initialCalendarId || calendars[0]?.id || "",
      title: initialValues?.title || "",
      description: initialValues?.description || "",
      location: initialValues?.location || "",
      isAllDay: initialValues?.isAllDay || false,
      startDate: initialValues?.startDate || dateStr,
      endDate:
        initialValues?.endDate &&
        initialValues.endDate >= (initialValues?.startDate || dateStr)
          ? initialValues.endDate
          : initialValues?.startDate || dateStr,
      startTime:
        initialStartTime && initialStartTime.includes(":")
          ? initialStartTime
          : "09:00",
      endTime:
        initialEndTime && initialEndTime.includes(":")
          ? initialEndTime
          : "10:00",
      timezone: initialValues?.timezone || tz.timezone || "UTC",
      recurrencePreset: (initialValues?.rrule
        ? parseRRule(initialValues.rrule).preset
        : "none") as RecurrenceFrequency,
      meetUrl: initialValues?.meetUrl || "",
      attendees: (initialValues?.attendees as AttendeeFormValues[]) || [],
      sourceMailMessageId: initialValues?.sourceMailMessageId || "",
    }
  }, [
    occurrence,
    initialDate,
    initialStartTime,
    initialEndTime,
    initialCalendarId,
    initialValues,
    tz,
    calendars,
  ])

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {occurrence ? "Edit Event" : "Create Calendar Event"}
          </DialogTitle>
        </DialogHeader>

        <EventDialogForm
          initialForm={initialForm}
          occurrence={occurrence}
          calendars={calendars}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
