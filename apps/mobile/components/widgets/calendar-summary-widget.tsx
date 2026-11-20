import { useMemo } from "react"
import { View, TouchableOpacity, Text, Linking } from "react-native"
import { useRouter } from "expo-router"
import {
  Calendar as CalendarIcon,
  ChevronRight,
  Video,
  Clock,
  CheckCircle2,
} from "lucide-react-native"
import {
  useTimezone,
  useCalendars,
  useCalendarEvents,
  useI18n,
} from "@saturn/hooks"
import { formatLocalDateString, parseDate } from "@saturn/core"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton-loader"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { formatEventTime } from "@/components/calendar/calendar-utils"

export function CalendarSummaryWidget() {
  const { colors, radius } = useTheme()
  const styles = useThemedStyles(createStyles)
  const router = useRouter()
  const tz = useTimezone()
  const { t } = useI18n()

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
            <CalendarIcon size={16} color={colors.primary} />
            <Text style={styles.titleText}>
              {t("dashboard.widget.today_schedule.title")}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.subtitleText}>
              {todayEvents.length === 0
                ? t("calendar.noEvents")
                : t("calendar.eventsCount", { count: todayEvents.length })}
            </Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      </CardHeader>

      {/* Content */}
      <CardContent style={styles.content}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Skeleton
              width="100%"
              height={38}
              style={{ borderRadius: radius.sm }}
            />
            <Skeleton
              width="100%"
              height={38}
              style={{ borderRadius: radius.sm, marginTop: 8 }}
            />
          </View>
        ) : todayEvents.length === 0 ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNavigateCalendar}
            style={styles.emptyContainer}
          >
            <CheckCircle2 size={18} color={colors.success} />
            <Text style={styles.emptyText}>
              {t("dashboard.widget.today_schedule.empty")}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.eventsList}>
            {visibleEvents.map((occ) => {
              const color = occ.color || colors.primary
              const timeStr = formatEventTime(
                occ,
                tz.timezone,
                tz.locale,
                t("calendar.allDay")
              )

              return (
                <TouchableOpacity
                  key={occ.instanceId || occ.eventId}
                  activeOpacity={0.7}
                  onPress={handleNavigateCalendar}
                  style={[styles.eventRow, { borderLeftColor: color }]}
                  testID={`calendar-widget-event-${occ.instanceId || occ.eventId}`}
                >
                  <View style={styles.eventInfo}>
                    <Text numberOfLines={1} style={styles.eventTitle}>
                      {occ.title || t("calendar.noTitle")}
                    </Text>
                    <View style={styles.eventMetaRow}>
                      <Clock size={11} color={colors.textMuted} />
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
                      <Video size={13} color={colors.primary} />
                      <Text style={styles.meetBtnText}>
                        {t("calendar.join")}
                      </Text>
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
                  {t("calendar.moreEvents", { count: remainingCount })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </CardContent>
    </Card>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  headerButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  headerRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  titleText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  subtitleText: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
  },
  loadingContainer: {
    paddingVertical: 4,
  },
  emptyContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingVertical: 6,
  },
  emptyText: {
    fontSize: 13,
    color: t.colors.textSecondary,
  },
  eventsList: {
    gap: 7,
  },
  eventRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  eventInfo: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  eventMetaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  eventTimeText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  meetBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: t.radius.xs,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: t.colors.borderFocus,
  },
  meetBtnText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  moreFooter: {
    alignItems: "center" as const,
    paddingTop: 4,
  },
  moreFooterText: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.primary,
  },
})
