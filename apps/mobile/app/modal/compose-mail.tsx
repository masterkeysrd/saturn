import React, { useState, useMemo, useEffect, useRef } from "react"
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
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as DocumentPicker from "expo-document-picker"
import {
  X,
  Send,
  Paperclip,
  Trash2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Image as ImageIcon,
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
  buildQuotedReplyHtml,
  buildForwardedMessageHtml,
  prepareUnifiedDraftHtml,
  stripHtmlToPlainText,
  formatAttachmentBytes,
} from "@saturn/core"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { RecipientInput } from "@/components/mail/recipient-input"
import {
  EmailRichEditor,
  EMPTY_ACTIVE_FORMATS,
  type EmailRichEditorHandle,
  type EmailEditorCommand,
  type EmailEditorActiveFormats,
} from "@/components/mail/email-rich-editor"

export default function ComposeMailModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
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

  // Subject & Unified Rich Editor Body
  const [subject, setSubject] = useState("")
  const [initialBodyHtml, setInitialBodyHtml] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [activeFormats, setActiveFormats] =
    useState<EmailEditorActiveFormats>(EMPTY_ACTIVE_FORMATS)
  const [remoteImagesRevealed, setRemoteImagesRevealed] = useState(false)

  const editorRef = useRef<EmailRichEditorHandle>(null)
  const initializedKeyRef = useRef<string | null>(null)

  const [isSending, setIsSending] = useState(false)

  const saveDraftMutation = useSaveDraft()
  const sendDraftMutation = useSendDraft()

  const targetMessage = useMemo(() => {
    if (!thread?.messages?.length) return undefined
    if (params.replyToMessageId) {
      return (
        thread.messages.find((m) => m.id === params.replyToMessageId) ||
        thread.messages[thread.messages.length - 1]
      )
    }
    return thread.messages[thread.messages.length - 1]
  }, [thread, params.replyToMessageId])

  const preparedContent = useMemo(
    () =>
      prepareUnifiedDraftHtml({
        bodyHtml: initialBodyHtml,
        bodyText: "",
        attachments: targetMessage?.attachments,
        loadRemoteImages: false,
      }),
    [initialBodyHtml, targetMessage?.attachments]
  )

  // Initialize reply/forward fields from thread when available
  useEffect(() => {
    if (params.initialTo) {
      setToRecipients([{ email: params.initialTo, displayName: "" }])
    }
    if (params.initialSubject) {
      setSubject(params.initialSubject)
    }

    const isReplyOrForward =
      params.mode === "DRAFT_MODE_REPLY" ||
      params.mode === "DRAFT_MODE_REPLY_ALL" ||
      params.mode === "DRAFT_MODE_FORWARD"

    if (
      thread &&
      targetMessage &&
      (params.replyToMessageId || isReplyOrForward)
    ) {
      const initKey = `${thread.id}:${targetMessage.id}:${params.mode || ""}`
      if (initializedKeyRef.current === initKey) return
      initializedKeyRef.current = initKey

      if (params.mode === "DRAFT_MODE_REPLY") {
        setSubject(normalizeReplySubject(thread.subject))
        const recipients = computeReplyRecipients({
          replyType: "reply",
          from: {
            email: targetMessage.from?.email || "",
            displayName: targetMessage.from?.name || "",
          },
          replyTo: (targetMessage.replyTo || []).map((p) => ({
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
            email: targetMessage.from?.email || "",
            displayName: targetMessage.from?.name || "",
          },
          to: (targetMessage.to || []).map((p) => ({
            email: p.email,
            displayName: p.name || "",
          })),
          cc: (targetMessage.cc || []).map((p) => ({
            email: p.email,
            displayName: p.name || "",
          })),
          replyTo: (targetMessage.replyTo || []).map((p) => ({
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
        if (targetMessage.attachments && targetMessage.attachments.length > 0) {
          setAttachments(targetMessage.attachments)
        }
      }

      const hasOriginalContent = Boolean(
        targetMessage.bodyHtml?.trim() ||
        targetMessage.bodyPlain?.trim() ||
        targetMessage.snippet?.trim()
      )

      if (params.mode === "DRAFT_MODE_FORWARD") {
        setInitialBodyHtml(
          buildForwardedMessageHtml({
            from: {
              email: targetMessage.from?.email || "",
              displayName: targetMessage.from?.name || "",
            },
            to: (targetMessage.to || []).map((p) => ({
              email: p.email,
              displayName: p.name || "",
            })),
            cc: (targetMessage.cc || []).map((p) => ({
              email: p.email,
              displayName: p.name || "",
            })),
            subject: targetMessage.subject || thread.subject || "",
            sentAt: targetMessage.sentAt,
            bodyHtml: targetMessage.bodyHtml,
            bodyText: targetMessage.bodyPlain || targetMessage.snippet,
            preserveStyles: true,
            attachments: targetMessage.attachments,
          })
        )
      } else if (hasOriginalContent) {
        setInitialBodyHtml(
          buildQuotedReplyHtml({
            from: {
              email: targetMessage.from?.email || "",
              displayName: targetMessage.from?.name || "",
            },
            sentAt: targetMessage.sentAt,
            bodyHtml: targetMessage.bodyHtml,
            bodyText: targetMessage.bodyPlain || targetMessage.snippet,
            preserveStyles: true,
            attachments: targetMessage.attachments,
          })
        )
      }
    }
  }, [thread, targetMessage, params, accounts])

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

      const finalHtml =
        editorRef.current?.getHTML() || preparedContent.bodyHtml || ""
      const plainBodyText =
        editorRef.current?.getText() || stripHtmlToPlainText(finalHtml)

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
        bodyText: plainBodyText,
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

          {/* Formatting Toolbar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            style={styles.formattingBar}
            contentContainerStyle={styles.formattingBarContent}
          >
            {(
              [
                { cmd: "bold", label: "Bold", Icon: Bold },
                { cmd: "italic", label: "Italic", Icon: Italic },
                { cmd: "underline", label: "Underline", Icon: Underline },
                { cmd: "strike", label: "Strikethrough", Icon: Strikethrough },
                { cmd: "heading2", label: "Heading", Icon: Heading2 },
                { cmd: "bulletList", label: "Bullet list", Icon: List },
                {
                  cmd: "orderedList",
                  label: "Numbered list",
                  Icon: ListOrdered,
                },
                { cmd: "blockquote", label: "Blockquote", Icon: Quote },
              ] as {
                cmd: EmailEditorCommand
                label: string
                Icon: typeof Bold
              }[]
            ).map(({ cmd, label, Icon }) => {
              const isActive = activeFormats[cmd]
              return (
                <Pressable
                  key={cmd}
                  accessibilityLabel={label}
                  onPress={() => {
                    haptics.selection()
                    editorRef.current?.execFormat(cmd)
                  }}
                  style={[styles.formatBtn, isActive && styles.formatBtnActive]}
                >
                  <Icon
                    size={16}
                    color={
                      isActive ? theme.colors.primary : theme.colors.textMuted
                    }
                  />
                </Pressable>
              )
            })}
          </ScrollView>

          {/* Remote Images Hidden Banner */}
          {preparedContent.hasRemoteImages && !remoteImagesRevealed && (
            <View style={styles.remoteBanner}>
              <View style={styles.remoteBannerLeft}>
                <ImageIcon size={14} color={theme.colors.warning} />
                <Text style={styles.remoteBannerText}>
                  Remote images in this draft are hidden.
                </Text>
              </View>
              <Pressable
                testID="mobile-composer-show-images-btn"
                onPress={() => {
                  haptics.selection()
                  setRemoteImagesRevealed(true)
                  editorRef.current?.revealRemoteImages()
                }}
              >
                <Text style={styles.remoteBannerAction}>Show images</Text>
              </Pressable>
            </View>
          )}

          {/* Unified Editable HTML Composer */}
          <EmailRichEditor
            ref={editorRef}
            testID="mobile-composer-body-input"
            bodyHtml={preparedContent.bodyHtml}
            stylesHtml={preparedContent.stylesHtml}
            placeholder="Compose email..."
            minHeight={240}
            autoFocus={true}
            onActiveFormatsChange={setActiveFormats}
          />
        </ScrollView>

        {/* Bottom Toolbar */}
        <View
          style={[
            styles.bottomToolbar,
            { paddingBottom: Math.max(insets.bottom, 10) },
          ]}
        >
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
  formattingBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    maxHeight: 42,
  },
  formattingBarContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  formatBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: theme.radius.xs,
  },
  formatBtnActive: {
    backgroundColor: theme.colors.primarySubtle,
  },
  remoteBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.warningSubtle,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  remoteBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  remoteBannerText: {
    fontSize: 12,
    color: theme.colors.warning,
    fontWeight: "500",
    flexShrink: 1,
  },
  remoteBannerAction: {
    fontSize: 12,
    color: theme.colors.warning,
    fontWeight: "700",
    textDecorationLine: "underline",
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
