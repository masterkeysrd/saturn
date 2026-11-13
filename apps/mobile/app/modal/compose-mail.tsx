import React, { useState, useMemo, useEffect } from "react"
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import * as DocumentPicker from "expo-document-picker"
import {
  X,
  Send,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react-native"
import {
  useConnectedAccounts,
  useMailThread,
  useSaveDraft,
  useSendDraft,
  type SaveDraftVariables,
} from "@saturn/hooks"
import type { MailRecipientFormValues } from "@saturn/schemas"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"
import {
  normalizeReplySubject,
  normalizeForwardSubject,
  computeReplyRecipients,
  formatAttachmentBytes,
} from "@saturn/core"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { RecipientInput } from "@/components/mail/recipient-input"

export default function ComposeMailModal() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    threadId?: string
    replyToMessageId?: string
    mode?:
      | "DRAFT_MODE_NEW"
      | "DRAFT_MODE_REPLY"
      | "DRAFT_MODE_REPLY_ALL"
      | "DRAFT_MODE_FORWARD"
    defaultAccountId?: string
    initialTo?: string
    initialSubject?: string
  }>()

  const { data: accountsData } = useConnectedAccounts()
  const accounts = useMemo(() => {
    return (accountsData?.accounts || []).filter(
      (a) =>
        a.enabledCapabilities?.includes("mail") ||
        a.enabledCapabilities?.includes("MAIL")
    )
  }, [accountsData])

  const { data: thread } = useMailThread(params.threadId, {
    enabled: Boolean(params.threadId),
  })

  // Selected sending account (defaults to the receiving account on reply, or first account)
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    return params.defaultAccountId || accounts[0]?.id || ""
  })

  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(params.defaultAccountId || accounts[0]?.id || "")
    }
  }, [accounts, selectedAccountId, params.defaultAccountId])

  // Recipient lists
  const [toRecipients, setToRecipients] = useState<MailRecipientFormValues[]>(
    []
  )
  const [ccRecipients, setCcRecipients] = useState<MailRecipientFormValues[]>(
    []
  )
  const [bccRecipients, setBccRecipients] = useState<MailRecipientFormValues[]>(
    []
  )
  const [showCcBcc, setShowCcBcc] = useState(false)

  // Subject & Body
  const [subject, setSubject] = useState("")
  const [bodyText, setBodyText] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])

  // Quoted reply HTML preservation
  const [quotedHtml, setQuotedHtml] = useState("")
  const [showQuotePreview, setShowQuotePreview] = useState(false)

  const [isSending, setIsSending] = useState(false)

  const saveDraftMutation = useSaveDraft()
  const sendDraftMutation = useSendDraft()

  // Initialize reply/forward fields from thread when available
  useEffect(() => {
    if (params.initialTo) {
      setToRecipients([{ email: params.initialTo, displayName: "" }])
    }
    if (params.initialSubject) {
      setSubject(params.initialSubject)
    }

    if (thread && params.replyToMessageId) {
      const targetMsg =
        thread.messages?.find((m) => m.id === params.replyToMessageId) ||
        thread.messages?.[thread.messages.length - 1]

      if (targetMsg) {
        if (params.mode === "DRAFT_MODE_REPLY") {
          setSubject(normalizeReplySubject(thread.subject))
          const recipients = computeReplyRecipients({
            replyType: "reply",
            from: {
              email: targetMsg.from?.email || "",
              displayName: targetMsg.from?.name || "",
            },
            replyTo: (targetMsg.replyTo || []).map((p) => ({
              email: p.email,
              displayName: p.name || "",
            })),
          })
          setToRecipients(
            recipients.to.map((r) => ({
              email: r.email,
              displayName: r.displayName || "",
            }))
          )
        } else if (params.mode === "DRAFT_MODE_REPLY_ALL") {
          setSubject(normalizeReplySubject(thread.subject))
          const selfAccount = accounts.find(
            (a) => a.id === thread.connectedAccountId
          )
          const selfEmails = selfAccount?.email ? [selfAccount.email] : []
          const recipients = computeReplyRecipients({
            replyType: "reply-all",
            from: {
              email: targetMsg.from?.email || "",
              displayName: targetMsg.from?.name || "",
            },
            to: (targetMsg.to || []).map((p) => ({
              email: p.email,
              displayName: p.name || "",
            })),
            cc: (targetMsg.cc || []).map((p) => ({
              email: p.email,
              displayName: p.name || "",
            })),
            replyTo: (targetMsg.replyTo || []).map((p) => ({
              email: p.email,
              displayName: p.name || "",
            })),
            selfEmails,
          })
          setToRecipients(
            recipients.to.map((r) => ({
              email: r.email,
              displayName: r.displayName || "",
            }))
          )
          setCcRecipients(
            recipients.cc.map((r) => ({
              email: r.email,
              displayName: r.displayName || "",
            }))
          )
          if (recipients.cc.length > 0) setShowCcBcc(true)
        } else if (params.mode === "DRAFT_MODE_FORWARD") {
          setSubject(normalizeForwardSubject(thread.subject))
        }

        if (targetMsg.bodyHtml) {
          setQuotedHtml(targetMsg.bodyHtml)
        }
      }
    }
  }, [thread, params, accounts])

  // Attachments picker via expo-document-picker
  const handlePickAttachment = async () => {
    haptics.selection()
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      })

      if (!result.canceled && result.assets) {
        const newAtts: Attachment[] = []
        for (const asset of result.assets) {
          // Limit to 25 MB per file
          const sizeBytes = asset.size || 0
          if (sizeBytes > 25 * 1024 * 1024) {
            Alert.alert(
              "File Too Large",
              `${asset.name} exceeds the 25 MB attachment limit.`
            )
            continue
          }

          newAtts.push({
            id: `att_local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            filename: asset.name || "attachment",
            contentType: asset.mimeType || "application/octet-stream",
            size: String(sizeBytes),
            downloadUrl: asset.uri,
            isInline: false,
            contentId: "",
          })
        }
        setAttachments((prev) => [...prev, ...newAtts])
      }
    } catch {
      // Ignored
    }
  }

  const handleRemoveAttachment = (index: number) => {
    haptics.selection()
    setAttachments((prev) => {
      const next = [...prev]
      next.splice(index, 1)
      return next
    })
  }

  // Send message
  const handleSend = async () => {
    if (
      toRecipients.length === 0 &&
      ccRecipients.length === 0 &&
      bccRecipients.length === 0
    ) {
      Alert.alert(
        "Missing Recipient",
        "Please add at least one recipient in To, Cc, or Bcc."
      )
      return
    }

    if (!selectedAccountId) {
      Alert.alert("Missing Account", "Please select a sending account.")
      return
    }

    try {
      setIsSending(true)
      haptics.selection()

      // Convert plain text to clean HTML
      const escapedBody = bodyText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\n/g, "<br>")

      let finalHtml = `<div style="font-family: -apple-system, sans-serif; font-size: 14px; line-height: 1.5;">${escapedBody}</div>`
      if (quotedHtml) {
        finalHtml += `<br><br><div class="saturn-quoted-reply"><blockquote style="margin: 0 0 0 0.8ex; border-left: 1px solid #ccc; padding-left: 1ex;">${quotedHtml}</blockquote></div>`
      }

      // 1. Save draft
      const draftPayload: SaveDraftVariables = {
        connectedAccountId: selectedAccountId || accounts[0]?.id || "",
        threadId: params.threadId,
        replyToMessageId: params.replyToMessageId,
        to: toRecipients.map((r) => ({
          email: r.email,
          name: r.displayName || "",
          avatarUrl: "",
          isVerified: false,
        })),
        cc: ccRecipients.map((r) => ({
          email: r.email,
          name: r.displayName || "",
          avatarUrl: "",
          isVerified: false,
        })),
        bcc: bccRecipients.map((r) => ({
          email: r.email,
          name: r.displayName || "",
          avatarUrl: "",
          isVerified: false,
        })),
        subject: subject.trim(),
        bodyHtml: finalHtml,
        bodyText,
        mode: params.mode || "DRAFT_MODE_NEW",
        attachments,
      }

      const savedDraft = await saveDraftMutation.mutateAsync(draftPayload)
      const targetDraftId = savedDraft?.id

      if (targetDraftId) {
        await sendDraftMutation.mutateAsync({ id: targetDraftId })
        haptics.success()
        router.back()
      } else {
        throw new Error("Failed to create draft for sending")
      }
    } catch (err: unknown) {
      const e = err as Error
      Alert.alert(
        "Failed to Send",
        e.message || "An unexpected error occurred while sending."
      )
    } finally {
      setIsSending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <View style={styles.container}>
        {/* Modal Top Bar */}
        <View style={styles.topBar}>
          <Pressable
            testID="mobile-composer-close-btn"
            onPress={() => router.back()}
            style={styles.iconBtn}
          >
            <X size={20} color={theme.colors.textPrimary} />
          </Pressable>

          <Text style={styles.topBarTitle}>
            {params.mode === "DRAFT_MODE_FORWARD"
              ? "Forward Message"
              : params.mode?.includes("REPLY")
                ? "Reply Message"
                : "New Message"}
          </Text>

          <Pressable
            testID="mobile-composer-send-btn"
            onPress={handleSend}
            disabled={isSending}
            style={[styles.sendBtn, isSending && styles.sendBtnDisabled]}
          >
            {isSending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primaryForeground}
              />
            ) : (
              <>
                <Send size={15} color={theme.colors.primaryForeground} />
                <Text style={styles.sendBtnText}>Send</Text>
              </>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.formScroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.formContent}
        >
          {/* From: Account Selector */}
          <View style={styles.fromRow}>
            <Text style={styles.fieldLabel}>From:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.accountPills}
            >
              {accounts.map((acc) => {
                const isSelected = selectedAccountId === acc.id
                return (
                  <Pressable
                    key={acc.id}
                    onPress={() => {
                      haptics.selection()
                      setSelectedAccountId(acc.id || "")
                    }}
                    style={[
                      styles.accountPill,
                      isSelected && styles.accountPillActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.accDot,
                        { backgroundColor: acc.color || theme.colors.primary },
                      ]}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.accountPillText,
                        isSelected && styles.accountPillTextActive,
                      ]}
                    >
                      {acc.displayName || acc.email}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          {/* To: Recipients */}
          <RecipientInput
            label="To"
            testID="mobile-composer-to-input"
            recipients={toRecipients}
            onChangeRecipients={setToRecipients}
            placeholder="Add recipient email..."
          />

          {/* Cc / Bcc Toggle Bar */}
          {!showCcBcc && (
            <Pressable
              onPress={() => setShowCcBcc(true)}
              style={styles.ccBccToggle}
            >
              <Text style={styles.ccBccToggleText}>+ Cc/Bcc</Text>
            </Pressable>
          )}

          {/* Cc: Recipients */}
          {showCcBcc && (
            <>
              <RecipientInput
                label="Cc"
                recipients={ccRecipients}
                onChangeRecipients={setCcRecipients}
                placeholder="Cc..."
              />
              <RecipientInput
                label="Bcc"
                recipients={bccRecipients}
                onChangeRecipients={setBccRecipients}
                placeholder="Bcc..."
              />
            </>
          )}

          {/* Subject Line */}
          <View style={styles.subjectRow}>
            <Text style={styles.fieldLabel}>Subject:</Text>
            <TextInput
              testID="mobile-composer-subject-input"
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.subjectInput}
            />
          </View>

          {/* Attachments List */}
          {attachments.length > 0 && (
            <View style={styles.attachmentsSection}>
              {attachments.map((att, index) => {
                const sizeBytes = parseInt(att.size || "0", 10) || 0
                return (
                  <View key={`${att.filename}-${index}`} style={styles.attItem}>
                    <Paperclip size={14} color={theme.colors.primary} />
                    <Text numberOfLines={1} style={styles.attFilename}>
                      {att.filename}
                    </Text>
                    <Text style={styles.attSize}>
                      {formatAttachmentBytes(sizeBytes)}
                    </Text>
                    <Pressable
                      onPress={() => handleRemoveAttachment(index)}
                      style={styles.attRemoveBtn}
                    >
                      <Trash2 size={13} color={theme.colors.destructive} />
                    </Pressable>
                  </View>
                )
              })}
            </View>
          )}

          {/* Body Native Text Input */}
          <TextInput
            testID="mobile-composer-body-input"
            value={bodyText}
            onChangeText={setBodyText}
            placeholder="Compose email..."
            placeholderTextColor={theme.colors.textMuted}
            multiline
            textAlignVertical="top"
            style={styles.bodyInput}
          />

          {/* Quoted Reply Preview */}
          {quotedHtml.length > 0 && (
            <View style={styles.quotedContainer}>
              <Pressable
                onPress={() => setShowQuotePreview((prev) => !prev)}
                style={styles.quotedHeader}
              >
                <Text style={styles.quotedHeaderText}>
                  {showQuotePreview
                    ? "Hide quoted message"
                    : "Show quoted message"}
                </Text>
                {showQuotePreview ? (
                  <ChevronUp size={14} color={theme.colors.textMuted} />
                ) : (
                  <ChevronDown size={14} color={theme.colors.textMuted} />
                )}
              </Pressable>
              {showQuotePreview && (
                <View style={styles.quotedContent}>
                  <Text style={styles.quotedText}>
                    (Original message preserved in sent email)
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom Toolbar */}
        <View style={styles.bottomToolbar}>
          <Pressable
            testID="mobile-composer-add-attachment"
            onPress={handlePickAttachment}
            style={styles.toolbarBtn}
          >
            <Paperclip size={18} color={theme.colors.textPrimary} />
            <Text style={styles.toolbarBtnText}>Attach File</Text>
          </Pressable>

          <Text style={styles.draftIndicatorText}>
            {saveDraftMutation.isPending ? "Saving draft..." : "Draft"}
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  iconBtn: {
    padding: 6,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.radius.full,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primaryForeground,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    paddingBottom: 40,
  },
  fromRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  fieldLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: "500",
    width: 60,
  },
  accountPills: {
    gap: 6,
    alignItems: "center",
  },
  accountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  accountPillActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  accDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  accountPillText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  accountPillTextActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  ccBccToggle: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  ccBccToggleText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  subjectInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: "600",
    paddingVertical: 4,
  },
  attachmentsSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  attItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  attFilename: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  attSize: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  attRemoveBtn: {
    padding: 2,
  },
  bodyInput: {
    flex: 1,
    minHeight: 220,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.colors.textPrimary,
    lineHeight: 22,
  },
  quotedContainer: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  quotedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quotedHeaderText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  quotedContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  quotedText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontStyle: "italic",
  },
  bottomToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  toolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.surfaceHighlight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
  },
  toolbarBtnText: {
    fontSize: 12,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  draftIndicatorText: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
})
