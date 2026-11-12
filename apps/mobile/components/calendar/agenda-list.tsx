import { useMemo } from "react"
import {
  View,
  Text,
  StyleSheet,
  SectionList,
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
import type { EventOccurrence } from "@saturn/api/saturn/calendar/v1/calendar"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import {
  groupEventsByDate,
  formatEventTime,
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
  const sections = useMemo<CalendarDateSection[]>(() => {
    return groupEventsByDate(occurrences, timeZone)
  }, [occurrences, timeZone])

  if (sections.length === 0) {
    return (
      <View style={styles.emptyContainer} testID="agenda-empty-state">
        <View style={styles.emptyIconCircle}>
          <CalendarIcon size={28} color={theme.colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>No Scheduled Events</Text>
        <Text style={styles.emptySubtitle}>
          There are no events found for the active calendars in this period.
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
            <Text style={styles.emptyActionText}>Schedule Event</Text>
          </TouchableOpacity>
        )}
      </View>
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
                <Text style={styles.todayPillText}>Today</Text>
              </View>
            )}
          </View>
        )
      }}
      renderItem={({ item: occ }) => {
        const eventColor = occ.color || theme.colors.primary
        const selfAttendee = occ.attendees?.find(
          (a) => a.isOrganizer || a.email
        )
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
                  {occ.title || "(No title)"}
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
                  {formatEventTime(occ, timeZone)}
                </Text>

                {occ.location ? (
                  <View style={styles.metaBadge}>
                    <MapPin size={12} color={theme.colors.textMuted} />
                    <Text numberOfLines={1} style={styles.metaBadgeText}>
                      {occ.location}
                    </Text>
                  </View>
                ) : null}

                {occ.meetUrl ? (
                  <View style={styles.metaBadge}>
                    <Video size={12} color={theme.colors.primary} />
                    <Text style={styles.metaBadgeTextPrimary}>Video</Text>
                  </View>
                ) : null}

                {/* RSVP response indicator icon */}
                {rsvpStatus === "ATTENDEE_RESPONSE_STATUS_ACCEPTED" && (
                  <View style={styles.rsvpBadgeAccepted}>
                    <Check size={11} color={theme.colors.success} />
                  </View>
                )}
                {rsvpStatus === "ATTENDEE_RESPONSE_STATUS_DECLINED" && (
                  <View style={styles.rsvpBadgeDeclined}>
                    <X size={11} color={theme.colors.destructive} />
                  </View>
                )}
                {rsvpStatus === "ATTENDEE_RESPONSE_STATUS_TENTATIVE" && (
                  <View style={styles.rsvpBadgeTentative}>
                    <HelpCircle size={11} color={theme.colors.warning} />
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

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dayBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBadgeToday: {
    backgroundColor: theme.colors.primary,
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  dayBadgeTextToday: {
    color: theme.colors.primaryForeground,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  todayPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySubtle,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  colorStrip: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
    justifyContent: "center",
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  calendarTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
    backgroundColor: theme.colors.surfaceElevated,
  },
  calendarTagText: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.textMuted,
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  itemTime: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textMuted,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaBadgeText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    maxWidth: 120,
  },
  metaBadgeTextPrimary: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  rsvpBadgeAccepted: {
    padding: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.successSubtle,
  },
  rsvpBadgeDeclined: {
    padding: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.destructiveSubtle,
  },
  rsvpBadgeTentative: {
    padding: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.warningSubtle,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 6,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyActionButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.primaryForeground,
  },
})
