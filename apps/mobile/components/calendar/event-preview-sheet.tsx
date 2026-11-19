import { forwardRef, useMemo } from "react"
import { View, Text, TouchableOpacity, ScrollView, Linking } from "react-native"
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
  useConnectedAccounts,
  type EventOccurrence,
  type AttendeeResponseStatus,
} from "@saturn/hooks"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { useToast } from "@/components/ui/toast"
import { useAuth } from "@/lib/auth-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { formatEventTime, findSelfAttendee } from "./calendar-utils"

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
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const respondMutation = useRespondToEvent()
  const { user } = useAuth()
  const { data: accountsData } = useConnectedAccounts()
  const toast = useToast()

  const selfEmails = useMemo(() => {
    const emails: string[] = []
    if (user?.email) emails.push(user.email)
    for (const acc of accountsData?.accounts || []) {
      if (acc.email) emails.push(acc.email)
    }
    return emails
  }, [user?.email, accountsData?.accounts])

  const selfAttendee = useMemo(
    () => findSelfAttendee(occurrence?.attendees, selfEmails),
    [occurrence?.attendees, selfEmails]
  )

  const currentRsvp = selfAttendee?.responseStatus

  const handleRespond = async (status: AttendeeResponseStatus) => {
    if (!occurrence || !selfAttendee) return
    haptics.selection()
    try {
      await respondMutation.mutateAsync({
        id: occurrence.eventId,
        response: status,
      })
      haptics.success()
    } catch (err: unknown) {
      haptics.error()
      const message =
        err instanceof Error ? err.message : "Could not update RSVP."
      toast.show({
        title: "RSVP failed",
        message,
        type: "error",
      })
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

  const eventColor = occurrence.color || colors.primary
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
          <Clock size={16} color={colors.textMuted} />
          <Text style={styles.infoText}>{timeFormatted}</Text>
        </View>

        {/* Location */}
        {occurrence.location ? (
          <View style={styles.infoRow}>
            <MapPin size={16} color={colors.textMuted} />
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
            <Video size={16} color={colors.primary} />
            <Text style={styles.meetButtonText} numberOfLines={1}>
              Join Video Call
            </Text>
            <ExternalLink size={14} color={colors.primary} />
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
              <Users size={16} color={colors.textMuted} />
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
        {selfAttendee && (
          <View style={styles.rsvpSection} testID="event-rsvp-section">
            <Text style={styles.sectionLabel}>Going?</Text>
            <View style={styles.rsvpButtonsRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() =>
                  handleRespond("ATTENDEE_RESPONSE_STATUS_ACCEPTED")
                }
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
                      ? colors.success
                      : colors.textMuted
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
                      ? colors.warning
                      : colors.textMuted
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
                onPress={() =>
                  handleRespond("ATTENDEE_RESPONSE_STATUS_DECLINED")
                }
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
                      ? colors.destructive
                      : colors.textMuted
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
        )}

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
            <Edit3 size={16} color={colors.textPrimary} />
            <Text style={styles.editButtonText}>Edit Event</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </AppBottomSheet>
  )
})

EventPreviewSheet.displayName = "EventPreviewSheet"

const createStyles = (t: SaturnMobileTheme) => ({
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
    alignItems: "center" as const,
  },
  emptyText: {
    color: t.colors.textMuted,
    fontSize: 14,
  },
  headerSection: {
    gap: 6,
  },
  calendarTagRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  calendarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calendarNameText: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  allDayBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: t.radius.xs,
    backgroundColor: t.colors.surfaceElevated,
  },
  allDayBadgeText: {
    fontSize: 10,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  titleText: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  infoRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    color: t.colors.textSecondary,
  },
  meetButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: t.colors.borderFocus,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  meetButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
  descriptionSection: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  descriptionText: {
    fontSize: 14,
    color: t.colors.textSecondary,
    lineHeight: 20,
  },
  attendeesSection: {
    gap: 8,
  },
  attendeesHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  attendeesList: {
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    overflow: "hidden" as const,
  },
  attendeeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
    gap: 10,
  },
  attendeeAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  attendeeAvatarText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  attendeeInfo: {
    flex: 1,
  },
  attendeeName: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
  },
  attendeeEmail: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  organizerBadge: {
    backgroundColor: t.colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: t.radius.xs,
  },
  organizerBadgeText: {
    fontSize: 10,
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
  rsvpSection: {
    gap: 8,
  },
  rsvpButtonsRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  rsvpBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 10,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  rsvpBtnAccepted: {
    borderColor: t.colors.success,
    backgroundColor: t.colors.successSubtle,
  },
  rsvpBtnTentative: {
    borderColor: t.colors.warning,
    backgroundColor: t.colors.warningSubtle,
  },
  rsvpBtnDeclined: {
    borderColor: t.colors.destructive,
    backgroundColor: t.colors.destructiveSubtle,
  },
  rsvpBtnText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  rsvpBtnTextAccepted: {
    color: t.colors.success,
  },
  rsvpBtnTextTentative: {
    color: t.colors.warning,
  },
  rsvpBtnTextDeclined: {
    color: t.colors.destructive,
  },
  editButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.borderStrong,
    marginTop: 4,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
})
