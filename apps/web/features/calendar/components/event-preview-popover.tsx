import { useMemo } from "react"
import {
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  HelpCircle,
  MapPin,
  Pencil,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react"
import { buildCopilotEntityKey } from "@saturn/core"
import { useI18n, useTimezone } from "@saturn/hooks"
import type { TranslationKey } from "@saturn/i18n"
import type {
  AttendeeResponseStatus,
  EventOccurrence,
} from "@saturn/api/saturn/calendar/v1/calendar"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CopilotAttachButton } from "@/features/ai/components/copilot-attach-button"
import { cn } from "@/lib/utils"

export interface EventPreviewPopoverProps {
  occurrence: EventOccurrence | null
  anchorEl?: HTMLElement | null
  canEdit?: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (occurrence: EventOccurrence) => void
  onDuplicate?: (occurrence: EventOccurrence) => void
  onDelete?: (occurrence: EventOccurrence) => void
}

function getRsvpMeta(
  status: AttendeeResponseStatus | undefined,
  t: (key: TranslationKey) => string
): {
  label: string
  dotClass: string
  icon: typeof Check
} {
  switch (status) {
    case "ATTENDEE_RESPONSE_STATUS_ACCEPTED":
      return {
        label: t("calendar.accepted"),
        dotClass: "bg-emerald-500",
        icon: Check,
      }
    case "ATTENDEE_RESPONSE_STATUS_DECLINED":
      return {
        label: t("calendar.declined"),
        dotClass: "bg-rose-500",
        icon: X,
      }
    case "ATTENDEE_RESPONSE_STATUS_TENTATIVE":
      return {
        label: t("calendar.rsvpMaybe"),
        dotClass: "bg-amber-500",
        icon: HelpCircle,
      }
    default:
      return {
        label: t("calendar.pending"),
        dotClass: "bg-muted-foreground/50",
        icon: Clock,
      }
  }
}

export function EventPreviewPopover({
  occurrence,
  anchorEl,
  canEdit = true,
  onOpenChange,
  onEdit,
  onDuplicate,
  onDelete,
}: EventPreviewPopoverProps) {
  const tz = useTimezone()
  const { t } = useI18n()

  const fallbackAnchor = useMemo(() => {
    if (anchorEl || typeof window === "undefined") return undefined
    return {
      getBoundingClientRect: () => ({
        top: window.innerHeight / 2,
        left: window.innerWidth / 2,
        right: window.innerWidth / 2,
        bottom: window.innerHeight / 2,
        width: 0,
        height: 0,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        toJSON: () => ({}),
      }),
    }
  }, [anchorEl])

  if (!occurrence) {
    return null
  }

  const safeMeetUrl =
    occurrence.meetUrl && /^https?:\/\//i.test(occurrence.meetUrl.trim())
      ? occurrence.meetUrl.trim()
      : ""

  const rawDateLabel = occurrence.isAllDay
    ? occurrence.startDate
      ? tz.format(tz.startOfDay(occurrence.startDate), {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : ""
    : occurrence.startTime
      ? tz.format(occurrence.startTime, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : ""
  const dateLabel = rawDateLabel
    ? rawDateLabel.charAt(0).toUpperCase() + rawDateLabel.slice(1)
    : ""

  const timeRangeLabel = occurrence.isAllDay
    ? t("calendar.allDay")
    : occurrence.startTime && occurrence.endTime
      ? `${tz.formatTime(occurrence.startTime, {
          hour: "numeric",
          minute: "2-digit",
        })} – ${tz.formatTime(occurrence.endTime, {
          hour: "numeric",
          minute: "2-digit",
        })}`
      : ""

  const attendees = occurrence.attendees ?? []
  const visibleAttendees = attendees.slice(0, 5)
  const extraAttendeesCount = Math.max(
    0,
    attendees.length - visibleAttendees.length
  )
  const color = occurrence.color || "#3b82f6"

  return (
    <Popover open={Boolean(occurrence)} onOpenChange={onOpenChange}>
      <PopoverContent
        anchor={anchorEl ?? fallbackAnchor}
        side="right"
        align="start"
        sideOffset={8}
        data-testid="event-preview-popover"
        className="w-[min(26rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl border border-border bg-popover p-0 shadow-xl"
      >
        <PopoverHeader className="flex-row items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <PopoverTitle className="truncate text-sm font-semibold text-foreground">
                {occurrence.title || t("calendar.noTitle")}
              </PopoverTitle>
              {occurrence.calendarName && (
                <PopoverDescription className="truncate text-xs text-muted-foreground">
                  {occurrence.calendarName}
                </PopoverDescription>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                data-testid="preview-edit-event-btn"
                onClick={() => onEdit(occurrence)}
                aria-label={t("common.edit")}
                title={t("common.edit")}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {canEdit && onDuplicate && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                data-testid="preview-duplicate-event-btn"
                onClick={() => onDuplicate(occurrence)}
                aria-label={t("calendar.duplicate")}
                title={t("calendar.duplicate")}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <Copy className="size-3.5" />
              </Button>
            )}
            {canEdit && onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                data-testid="preview-delete-event-btn"
                onClick={() => onDelete(occurrence)}
                aria-label={t("common.delete")}
                title={t("common.delete")}
                className="cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
            {occurrence.eventId && (
              <CopilotAttachButton
                item={{
                  key: buildCopilotEntityKey(
                    "calendar_event",
                    occurrence.eventId
                  ),
                  kind: "calendar_event",
                  id: occurrence.eventId,
                  label: occurrence.title || "Calendar Event",
                  summary: {
                    isAllDay: occurrence.isAllDay,
                    startTime: occurrence.startTime || occurrence.startDate,
                    endTime: occurrence.endTime || occurrence.endDate,
                    ...(occurrence.location
                      ? { location: occurrence.location }
                      : {}),
                  },
                }}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onOpenChange(false)}
              aria-label={t("common.close")}
              title={t("common.close")}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </PopoverHeader>

        <div className="space-y-3 px-4 py-3.5 text-xs">
          {/* Date & Time */}
          <div className="flex items-start gap-2.5 text-foreground">
            <Calendar className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-0.5">
              {dateLabel && <p className="font-medium">{dateLabel}</p>}
              {timeRangeLabel && (
                <p className="text-muted-foreground tabular-nums">
                  {timeRangeLabel}
                </p>
              )}
            </div>
          </div>

          {/* 1-click Join Meeting */}
          {safeMeetUrl && (
            <div>
              <a
                href={safeMeetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)] transition-colors hover:bg-primary/90"
              >
                <Video className="size-3.5 shrink-0" />
                <span>{t("calendar.joinMeeting")}</span>
                <ExternalLink className="size-3 opacity-80" />
              </a>
            </div>
          )}

          {/* Location */}
          {occurrence.location && (
            <div className="flex items-start gap-2.5 text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-words text-foreground">
                {occurrence.location}
              </span>
            </div>
          )}

          {/* Attendees */}
          {attendees.length > 0 && (
            <div className="space-y-1.5 border-t border-border/40 pt-3">
              <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <Users className="size-3.5 shrink-0" />
                <span>
                  {t("calendar.attendeeCount", { count: attendees.length })}
                </span>
              </div>
              <div className="space-y-1 pl-5">
                {visibleAttendees.map((att) => {
                  const meta = getRsvpMeta(att.responseStatus, t)
                  return (
                    <div
                      key={att.email}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 truncate text-foreground">
                        {att.displayName || att.email}
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
                        title={meta.label}
                      >
                        <span
                          className={cn("size-1.5 rounded-full", meta.dotClass)}
                        />
                        <span>{meta.label}</span>
                      </span>
                    </div>
                  )
                })}
                {extraAttendeesCount > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("calendar.moreEvents", { count: extraAttendeesCount })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {occurrence.description && (
            <p className="line-clamp-3 border-t border-border/40 pt-3 leading-relaxed text-muted-foreground">
              {occurrence.description}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
