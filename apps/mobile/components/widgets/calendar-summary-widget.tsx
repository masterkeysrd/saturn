import { useMemo } from "react"
import { StyleSheet, View, TouchableOpacity, Text, Linking } from "react-native"
import { useRouter } from "expo-router"
import {
  Calendar as CalendarIcon,
  ChevronRight,
  Video,
  Clock,
  CheckCircle2,
} from "lucide-react-native"
import { useTimezone, useCalendars, useCalendarEvents } from "@saturn/hooks"
import { formatLocalDateString, parseDate } from "@saturn/core"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { formatEventTime } from "@/components/calendar/calendar-utils"

export function CalendarSummaryWidget() {
  const router = useRouter()
  const tz = useTimezone()

  const todayStr = useMemo(
    () => formatLocalDateString(new Date(), tz.timezone),
    [tz.timezone]
  )

  const { data: calendarsData } = useCalendars()
  const enabledCalendarIds = useMemo(() => {
    return (calendarsData?.calendars || [])
      .filter((c) => c.isEnabled)
      .map((c) => c.id)
  }, [calendarsData])

  // Query events for today
  const { rangeStart, rangeEnd } = useMemo(() => {
    const todayStart = tz.startOfDay(new Date())
    const todayEnd = tz.endOfDay(new Date())
    return {
      rangeStart: todayStart.toISOString(),
      rangeEnd: todayEnd.toISOString(),
    }
  }, [tz])

  const { data: eventsData, isLoading } = useCalendarEvents(
    rangeStart,
    rangeEnd,
    enabledCalendarIds
  )

  const todayEvents = useMemo(() => {
    const list = eventsData?.occurrences || []
    // Filter for events occurring on today
    const filtered = list.filter((occ) => {
      if (occ.isAllDay) {
        return (
          occ.startDate <= todayStr &&
          (occ.endDate > todayStr || occ.endDate === occ.startDate)
        )
      }
      if (occ.startTime) {
        const p = parseDate(occ.startTime)
        if (p) {
          return formatLocalDateString(p, tz.timezone) === todayStr
        }
      }
      return false
    })

    // Sort: all day first, then chronological
    return filtered.sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1
      if (!a.isAllDay && b.isAllDay) return 1
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0
      return aTime - bTime
    })
  }, [eventsData, todayStr, tz.timezone])

  const handleNavigateCalendar = () => {
    haptics.light()
    router.push("/(app)/(tabs)/calendar")
  }

  const handleOpenMeet = (meetUrl: string) => {
    haptics.light()
    Linking.openURL(meetUrl).catch(() => {})
  }

  const visibleEvents = todayEvents.slice(0, 3)
  const remainingCount = Math.max(0, todayEvents.length - 3)

  return (
    <Card style={styles.card} testID="calendar-summary-widget">
      {/* Header */}
      <CardHeader style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleNavigateCalendar}
          style={styles.headerButton}
          testID="calendar-widget-header-btn"
        >
          <View style={styles.headerTitleRow}>
            <View style={styles.iconBadge}>
              <CalendarIcon size={16} color={theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.titleText}>{"Today's Schedule"}</Text>
              <Text style={styles.subtitleText}>
                {todayEvents.length === 0
                  ? "No events"
                  : `${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"}`}
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </CardHeader>

      {/* Content */}
      <CardContent style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Skeleton
              width="100%"
              height={38}
              style={{ borderRadius: theme.radius.sm }}
            />
            <Skeleton
              width="100%"
              height={38}
              style={{ borderRadius: theme.radius.sm, marginTop: 8 }}
            />
          </View>
        ) : todayEvents.length === 0 ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNavigateCalendar}
            style={styles.emptyContainer}
          >
            <CheckCircle2 size={18} color={theme.colors.success} />
            <Text style={styles.emptyText}>
              All clear for today. Tap to view calendar.
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.eventsList}>
            {visibleEvents.map((occ) => {
              const color = occ.color || theme.colors.primary
              const timeStr = formatEventTime(occ, tz.timezone)

              return (
                <TouchableOpacity
                  key={occ.instanceId || occ.eventId}
                  activeOpacity={0.7}
                  onPress={handleNavigateCalendar}
                  style={styles.eventRow}
                  testID={`calendar-widget-event-${occ.instanceId || occ.eventId}`}
                >
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <View style={styles.eventInfo}>
                    <Text numberOfLines={1} style={styles.eventTitle}>
                      {occ.title || "(No title)"}
                    </Text>
                    <View style={styles.eventMetaRow}>
                      <Clock size={11} color={theme.colors.textMuted} />
                      <Text style={styles.eventTimeText}>{timeStr}</Text>
                    </View>
                  </View>
                  {occ.meetUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleOpenMeet(occ.meetUrl)}
                      style={styles.meetBtn}
                      testID="calendar-widget-meet-btn"
                    >
                      <Video size={13} color={theme.colors.primary} />
                      <Text style={styles.meetBtnText}>Join</Text>
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              )
            })}

            {remainingCount > 0 && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleNavigateCalendar}
                style={styles.moreFooter}
              >
                <Text style={styles.moreFooterText}>
                  +{remainingCount} more event{remainingCount === 1 ? "" : "s"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </CardContent>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  subtitleText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
  },
  loadingContainer: {
    paddingVertical: 4,
  },
  emptyContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.sm,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  eventsList: {
    gap: 8,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventInfo: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  eventTimeText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  meetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.xs,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderFocus,
  },
  meetBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  moreFooter: {
    alignItems: "center",
    paddingTop: 4,
  },
  moreFooterText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.primary,
  },
})
