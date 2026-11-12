import { forwardRef, useMemo } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from "react-native"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  Clock,
  MapPin,
  Video,
  Users,
  Edit3,
  ExternalLink,
  Check,
  X,
  HelpCircle,
} from "lucide-react-native"
import {
  useRespondToEvent,
  type EventOccurrence,
  type AttendeeResponseStatus,
} from "@saturn/hooks"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { formatEventTime } from "./calendar-utils"

export interface EventPreviewSheetProps {
  occurrence?: EventOccurrence
  timeZone: string
  canEdit?: boolean
  onEdit?: (occ: EventOccurrence) => void
  onClose?: () => void
}

export const EventPreviewSheet = forwardRef<
  BottomSheet,
  EventPreviewSheetProps
>(({ occurrence, timeZone, canEdit = true, onEdit, onClose }, ref) => {
  const respondMutation = useRespondToEvent()

  const selfAttendee = useMemo(() => {
    if (!occurrence?.attendees) return undefined
    return occurrence.attendees.find((a) => a.isOrganizer || a.email)
  }, [occurrence])

  const currentRsvp = selfAttendee?.responseStatus

  const handleRespond = async (status: AttendeeResponseStatus) => {
    if (!occurrence) return
    haptics.selection()
    try {
      await respondMutation.mutateAsync({
        id: occurrence.eventId,
        response: status,
      })
      haptics.success()
    } catch {
      haptics.error()
    }
  }

  const handleOpenMeet = () => {
    if (!occurrence?.meetUrl) return
    haptics.light()
    Linking.openURL(occurrence.meetUrl).catch(() => {})
  }

  if (!occurrence) {
    return (
      <AppBottomSheet
        ref={ref}
        title="Event Details"
        snapPoints={["45%"]}
        onClose={onClose}
      >
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No event selected.</Text>
        </View>
      </AppBottomSheet>
    )
  }

  const eventColor = occurrence.color || theme.colors.primary
  const timeFormatted = formatEventTime(occurrence, timeZone)

  return (
    <AppBottomSheet
      ref={ref}
      title=""
      snapPoints={["60%", "90%"]}
      onClose={onClose}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Title & Calendar Banner */}
        <View style={styles.headerSection}>
          <View style={styles.calendarTagRow}>
            <View
              style={[styles.calendarDot, { backgroundColor: eventColor }]}
            />
            <Text style={styles.calendarNameText}>
              {occurrence.calendarName || "Calendar"}
            </Text>
            {occurrence.isAllDay && (
              <View style={styles.allDayBadge}>
                <Text style={styles.allDayBadgeText}>All day</Text>
              </View>
            )}
          </View>
          <Text style={styles.titleText}>
            {occurrence.title || "(No title)"}
          </Text>
        </View>

        {/* Date & Time */}
        <View style={styles.infoRow}>
          <Clock size={16} color={theme.colors.textMuted} />
          <Text style={styles.infoText}>{timeFormatted}</Text>
        </View>

        {/* Location */}
        {occurrence.location ? (
          <View style={styles.infoRow}>
            <MapPin size={16} color={theme.colors.textMuted} />
            <Text style={styles.infoText}>{occurrence.location}</Text>
          </View>
        ) : null}

        {/* Video Conference Link */}
        {occurrence.meetUrl ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleOpenMeet}
            style={styles.meetButton}
            testID="event-meet-button"
          >
            <Video size={16} color={theme.colors.primary} />
            <Text style={styles.meetButtonText} numberOfLines={1}>
              Join Video Call
            </Text>
            <ExternalLink size={14} color={theme.colors.primary} />
          </TouchableOpacity>
        ) : null}

        {/* Description */}
        {occurrence.description ? (
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.descriptionText}>{occurrence.description}</Text>
          </View>
        ) : null}

        {/* Attendees List */}
        {occurrence.attendees && occurrence.attendees.length > 0 && (
          <View style={styles.attendeesSection}>
            <View style={styles.attendeesHeader}>
              <Users size={16} color={theme.colors.textMuted} />
              <Text style={styles.sectionLabel}>
                Attendees ({occurrence.attendees.length})
              </Text>
            </View>
            <View style={styles.attendeesList}>
              {occurrence.attendees.map((att, i) => {
                const initial = (att.displayName || att.email || "?")
                  .slice(0, 1)
                  .toUpperCase()
                return (
                  <View key={att.email || i} style={styles.attendeeRow}>
                    <View style={styles.attendeeAvatar}>
                      <Text style={styles.attendeeAvatarText}>{initial}</Text>
                    </View>
                    <View style={styles.attendeeInfo}>
                      <Text numberOfLines={1} style={styles.attendeeName}>
                        {att.displayName || att.email}
                      </Text>
                      {att.displayName && att.email ? (
                        <Text numberOfLines={1} style={styles.attendeeEmail}>
                          {att.email}
                        </Text>
                      ) : null}
                    </View>
                    {att.isOrganizer && (
                      <View style={styles.organizerBadge}>
                        <Text style={styles.organizerBadgeText}>Host</Text>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* RSVP Action Bar */}
        <View style={styles.rsvpSection} testID="event-rsvp-section">
          <Text style={styles.sectionLabel}>Going?</Text>
          <View style={styles.rsvpButtonsRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleRespond("ATTENDEE_RESPONSE_STATUS_ACCEPTED")}
              style={[
                styles.rsvpBtn,
                currentRsvp === "ATTENDEE_RESPONSE_STATUS_ACCEPTED" &&
                  styles.rsvpBtnAccepted,
              ]}
              testID="event-rsvp-yes"
            >
              <Check
                size={14}
                color={
                  currentRsvp === "ATTENDEE_RESPONSE_STATUS_ACCEPTED"
                    ? theme.colors.success
                    : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.rsvpBtnText,
                  currentRsvp === "ATTENDEE_RESPONSE_STATUS_ACCEPTED" &&
                    styles.rsvpBtnTextAccepted,
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                handleRespond("ATTENDEE_RESPONSE_STATUS_TENTATIVE")
              }
              style={[
                styles.rsvpBtn,
                currentRsvp === "ATTENDEE_RESPONSE_STATUS_TENTATIVE" &&
                  styles.rsvpBtnTentative,
              ]}
              testID="event-rsvp-maybe"
            >
              <HelpCircle
                size={14}
                color={
                  currentRsvp === "ATTENDEE_RESPONSE_STATUS_TENTATIVE"
                    ? theme.colors.warning
                    : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.rsvpBtnText,
                  currentRsvp === "ATTENDEE_RESPONSE_STATUS_TENTATIVE" &&
                    styles.rsvpBtnTextTentative,
                ]}
              >
                Maybe
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleRespond("ATTENDEE_RESPONSE_STATUS_DECLINED")}
              style={[
                styles.rsvpBtn,
                currentRsvp === "ATTENDEE_RESPONSE_STATUS_DECLINED" &&
                  styles.rsvpBtnDeclined,
              ]}
              testID="event-rsvp-no"
            >
              <X
                size={14}
                color={
                  currentRsvp === "ATTENDEE_RESPONSE_STATUS_DECLINED"
                    ? theme.colors.destructive
                    : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.rsvpBtnText,
                  currentRsvp === "ATTENDEE_RESPONSE_STATUS_DECLINED" &&
                    styles.rsvpBtnTextDeclined,
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Edit Button (if not viewer) */}
        {canEdit && onEdit && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              haptics.light()
              onEdit(occurrence)
            }}
            style={styles.editButton}
            testID="event-edit-button"
          >
            <Edit3 size={16} color={theme.colors.textPrimary} />
            <Text style={styles.editButtonText}>Edit Event</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </AppBottomSheet>
  )
})

EventPreviewSheet.displayName = "EventPreviewSheet"

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 16,
  },
  emptyContainer: {
    padding: 30,
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  headerSection: {
    gap: 6,
  },
  calendarTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  calendarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calendarNameText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textMuted,
  },
  allDayBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.radius.xs,
    backgroundColor: theme.colors.surfaceElevated,
  },
  allDayBadgeText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  titleText: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  meetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderFocus,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  meetButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  descriptionSection: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  descriptionText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  attendeesSection: {
    gap: 8,
  },
  attendeesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  attendeesList: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  attendeeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 10,
  },
  attendeeAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  attendeeAvatarText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  attendeeInfo: {
    flex: 1,
  },
  attendeeName: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textPrimary,
  },
  attendeeEmail: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  organizerBadge: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
  },
  organizerBadgeText: {
    fontSize: 10,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  rsvpSection: {
    gap: 8,
  },
  rsvpButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  rsvpBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rsvpBtnAccepted: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successSubtle,
  },
  rsvpBtnTentative: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSubtle,
  },
  rsvpBtnDeclined: {
    borderColor: theme.colors.destructive,
    backgroundColor: theme.colors.destructiveSubtle,
  },
  rsvpBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  rsvpBtnTextAccepted: {
    color: theme.colors.success,
  },
  rsvpBtnTextTentative: {
    color: theme.colors.warning,
  },
  rsvpBtnTextDeclined: {
    color: theme.colors.destructive,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    marginTop: 4,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
})
