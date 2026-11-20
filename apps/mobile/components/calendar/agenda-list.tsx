import { useMemo } from "react"
import {
  View,
  Text,
  SectionList,
  ScrollView,
  TouchableOpacity,
  type RefreshControlProps,
} from "react-native"
import {
  Calendar as CalendarIcon,
  Video,
  MapPin,
  Check,
  X,
  HelpCircle,
} from "lucide-react-native"
import { useConnectedAccounts, useI18n, useTimezone } from "@saturn/hooks"
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import { useAuth } from "@/lib/auth-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  groupEventsByDate,
  formatEventTime,
  findSelfAttendee,
  type CalendarDateSection,
} from "./calendar-utils"

export interface AgendaListProps {
  occurrences: EventOccurrence[]
  timeZone: string
  onSelectOccurrence: (occ: EventOccurrence) => void
  onOpenCreate?: () => void
  refreshControl?: React.ReactElement<RefreshControlProps>
  canCreate?: boolean
}

export function AgendaList({
  occurrences,
  timeZone,
  onSelectOccurrence,
  onOpenCreate,
  refreshControl,
  canCreate = true,
}: AgendaListProps) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { user } = useAuth()
  const { t } = useI18n()
  const tz = useTimezone()
  const { data: accountsData } = useConnectedAccounts()
  const selfEmails = useMemo(() => {
    const emails: string[] = []
    if (user?.email) emails.push(user.email)
    for (const acc of accountsData?.accounts || []) {
      if (acc.email) emails.push(acc.email)
    }
    return emails
  }, [user, accountsData?.accounts])

  const sections = useMemo<CalendarDateSection[]>(() => {
    return groupEventsByDate(occurrences, timeZone, tz.locale)
  }, [occurrences, timeZone, tz.locale])

  if (sections.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyContainer}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        testID="agenda-empty-state"
      >
        <View style={styles.emptyIconCircle}>
          <CalendarIcon size={28} color={colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>{t("calendar.noScheduledEvents")}</Text>
        <Text style={styles.emptySubtitle}>
          {t("calendar.noScheduledEventsDescription")}
        </Text>
        {canCreate && onOpenCreate && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              onOpenCreate()
            }}
            style={styles.emptyActionButton}
            testID="agenda-empty-create-btn"
          >
            <Text style={styles.emptyActionText}>
              {t("calendar.scheduleEvent")}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    )
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item, index) =>
        item.instanceId || item.eventId || String(index)
      }
      refreshControl={refreshControl}
      stickySectionHeadersEnabled={true}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      renderSectionHeader={({ section }) => {
        const d = section.dateString.split("-")[2]
        return (
          <View
            style={styles.sectionHeader}
            testID={`agenda-section-${section.dateString}`}
          >
            <View
              style={[styles.dayBadge, section.isToday && styles.dayBadgeToday]}
            >
              <Text
                style={[
                  styles.dayBadgeText,
                  section.isToday && styles.dayBadgeTextToday,
                ]}
              >
                {Number(d)}
              </Text>
            </View>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.isToday && (
              <View style={styles.todayPill}>
                <Text style={styles.todayPillText}>{t("common.today")}</Text>
              </View>
            )}
          </View>
        )
      }}
      renderItem={({ item: occ }) => {
        const eventColor = occ.color || colors.primary
        const selfAttendee = findSelfAttendee(occ.attendees, selfEmails)
        const rsvpStatus = selfAttendee?.responseStatus

        return (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              onSelectOccurrence(occ)
            }}
            style={styles.itemRow}
            testID={`agenda-item-${occ.instanceId || occ.eventId}`}
          >
            {/* Calendar color indicator strip */}
            <View
              style={[styles.colorStrip, { backgroundColor: eventColor }]}
            />

            <View style={styles.itemContent}>
              {/* Row Header: Title & Calendar Badge */}
              <View style={styles.itemHeader}>
                <Text numberOfLines={1} style={styles.itemTitle}>
                  {occ.title || t("calendar.noTitle")}
                </Text>
                {occ.calendarName ? (
                  <View style={styles.calendarTag}>
                    <Text numberOfLines={1} style={styles.calendarTagText}>
                      {occ.calendarName}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Time & Location */}
              <View style={styles.itemMetaRow}>
                <Text style={styles.itemTime}>
                  {formatEventTime(
                    occ,
                    timeZone,
                    tz.locale,
                    t("calendar.allDay")
                  )}
                </Text>

                {occ.location ? (
                  <View style={styles.metaBadge}>
                    <MapPin size={12} color={colors.textMuted} />
                    <Text numberOfLines={1} style={styles.metaBadgeText}>
                      {occ.location}
                    </Text>
                  </View>
                ) : null}

                {occ.meetUrl ? (
                  <View style={styles.metaBadge}>
                    <Video size={12} color={colors.primary} />
                    <Text style={styles.metaBadgeTextPrimary}>
                      {t("calendar.video")}
                    </Text>
                  </View>
                ) : null}

                {/* RSVP response indicator icon */}
                {rsvpStatus === "ATTENDEE_RESPONSE_STATUS_ACCEPTED" && (
                  <View style={styles.rsvpBadgeAccepted}>
                    <Check size={11} color={colors.success} />
                  </View>
                )}
                {rsvpStatus === "ATTENDEE_RESPONSE_STATUS_DECLINED" && (
                  <View style={styles.rsvpBadgeDeclined}>
                    <X size={11} color={colors.destructive} />
                  </View>
                )}
                {rsvpStatus === "ATTENDEE_RESPONSE_STATUS_TENTATIVE" && (
                  <View style={styles.rsvpBadgeTentative}>
                    <HelpCircle size={11} color={colors.warning} />
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )
      }}
    />
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  listContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: t.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  dayBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  dayBadgeToday: {
    backgroundColor: t.colors.primary,
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  dayBadgeTextToday: {
    color: t.colors.primaryForeground,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  todayPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primarySubtle,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  itemRow: {
    flexDirection: "row" as const,
    alignItems: "stretch" as const,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  colorStrip: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
    justifyContent: "center" as const,
  },
  itemHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  calendarTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: t.radius.xs,
    backgroundColor: t.colors.surfaceElevated,
  },
  calendarTagText: {
    fontSize: 10,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  itemMetaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 4,
  },
  itemTime: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  metaBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
  },
  metaBadgeText: {
    fontSize: 11,
    color: t.colors.textMuted,
    maxWidth: 120,
  },
  metaBadgeTextPrimary: {
    fontSize: 11,
    color: t.colors.primary,
    fontWeight: "500" as const,
  },
  rsvpBadgeAccepted: {
    padding: 2,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.successSubtle,
  },
  rsvpBadgeDeclined: {
    padding: 2,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.destructiveSubtle,
  },
  rsvpBadgeTentative: {
    padding: 2,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.warningSubtle,
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    marginBottom: 6,
    textAlign: "center" as const,
  },
  emptySubtitle: {
    fontSize: 13,
    color: t.colors.textMuted,
    textAlign: "center" as const,
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyActionButton: {
    backgroundColor: t.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: t.radius.md,
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.primaryForeground,
  },
})
