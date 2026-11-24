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
  useDrafts,
  useMailThread,
  useSaveDraft,
  useSendDraft,
  uploadDraftAttachment,
  useI18n,
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
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { useSpace } from "@/lib/space-context"
import { RecipientInput } from "@/components/mail/recipient-input"
import {
  EmailRichEditor,
  EMPTY_ACTIVE_FORMATS,
  type EmailRichEditorHandle,
  type EmailEditorCommand,
  type EmailEditorActiveFormats,
} from "@/components/mail/email-rich-editor"

function isLocalAttachment(att: Attachment): boolean {
  const url = att.downloadUrl || ""
  return (
    url.startsWith("file://") ||
    url.startsWith("content://") ||
    att.id.startsWith("att_local_")
  )
}

export default function ComposeMailModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = useI18n()
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { mailAutoLoadRemoteContent } = useSpace()
  const params = useLocalSearchParams<{
    draftId?: string
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

  const { data: draftsData } = useDrafts(params.defaultAccountId, {
    enabled: Boolean(params.draftId),
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
  const [draftId, setDraftId] = useState<string | undefined>(params.draftId)
  const [subject, setSubject] = useState("")
  const [initialBodyHtml, setInitialBodyHtml] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [activeFormats, setActiveFormats] =
    useState<EmailEditorActiveFormats>(EMPTY_ACTIVE_FORMATS)
  const [remoteImagesRevealed, setRemoteImagesRevealed] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

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
        loadRemoteImages: mailAutoLoadRemoteContent,
      }),
    [initialBodyHtml, targetMessage?.attachments, mailAutoLoadRemoteContent]
  )

  // Initialize existing draft when editing from Drafts mailbox
  useEffect(() => {
    if (!params.draftId || !draftsData?.drafts) return
    const existingDraft = draftsData.drafts.find((d) => d.id === params.draftId)
    if (!existingDraft) return

    const initKey = `draft:${existingDraft.id}`
    if (initializedKeyRef.current === initKey) return
    initializedKeyRef.current = initKey

    setDraftId(existingDraft.id)
    if (existingDraft.connectedAccountId) {
      setSelectedAccountId(existingDraft.connectedAccountId)
    }
    setToRecipients(
      (existingDraft.to || []).map((p) => ({
        email: p.email,
        displayName: p.name || "",
      }))
    )
    const ccList = (existingDraft.cc || []).map((p) => ({
      email: p.email,
      displayName: p.name || "",
    }))
    const bccList = (existingDraft.bcc || []).map((p) => ({
      email: p.email,
      displayName: p.name || "",
    }))
    setCcRecipients(ccList)
    setBccRecipients(bccList)
    if (ccList.length > 0 || bccList.length > 0) setShowCcBcc(true)
    setSubject(existingDraft.subject || "")
    setInitialBodyHtml(existingDraft.bodyHtml || existingDraft.bodyText || "")
    setAttachments(existingDraft.attachments || [])
    setIsDirty(false)
  }, [params.draftId, draftsData])

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
        if (newAtts.length > 0) {
          setIsDirty(true)
        }
      }
    } catch {
      // Ignored
    }
  }

  const handleRemoveAttachment = (index: number) => {
    haptics.selection()
    setIsDirty(true)
    setAttachments((prev) => {
      const next = [...prev]
      next.splice(index, 1)
      return next
    })
  }

  const persistDraftWithAttachments = async (): Promise<string> => {
    const finalHtml =
      editorRef.current?.getHTML() || preparedContent.bodyHtml || ""
    const plainBodyText =
      editorRef.current?.getText() || stripHtmlToPlainText(finalHtml)

    const serverAttachments = attachments.filter(
      (att) => !isLocalAttachment(att)
    )
    const localAttachments = attachments.filter((att) => isLocalAttachment(att))

    const draftPayload: SaveDraftVariables = {
      id: draftId,
      connectedAccountId: selectedAccountId,
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
      attachments: serverAttachments,
    }

    const savedDraft = await saveDraftMutation.mutateAsync(draftPayload)
    const targetDraftId = savedDraft?.id || draftId

    if (!targetDraftId) {
      throw new Error("Failed to create draft for sending")
    }
    setDraftId(targetDraftId)

    if (localAttachments.length > 0) {
      const uploadedAttachments: Attachment[] = [...serverAttachments]
      for (let i = 0; i < localAttachments.length; i++) {
        const att = localAttachments[i]
        try {
          const uploaded = await uploadDraftAttachment({
            draftId: targetDraftId,
            file: {
              uri: att.downloadUrl,
              name: att.filename,
              type: att.contentType || "application/octet-stream",
            } as unknown as Blob,
            filename: att.filename,
          })
          if (uploaded) {
            uploadedAttachments.push(uploaded)
          }
        } catch (uploadErr: unknown) {
          const remaining = localAttachments.slice(i)
          setAttachments([...uploadedAttachments, ...remaining])
          const msg =
            uploadErr instanceof Error
              ? uploadErr.message
              : "Attachment upload failed"
          throw new Error(`Failed to upload "${att.filename}": ${msg}`)
        }
      }
      setAttachments(uploadedAttachments)
    }

    return targetDraftId
  }

  // Send message
  const handleSend = async () => {
    if (
      toRecipients.length === 0 &&
      ccRecipients.length === 0 &&
      bccRecipients.length === 0
    ) {
      Alert.alert(t("mail.missingRecipient"), t("mail.addAtLeastOneRecipient"))
      return
    }

    if (!selectedAccountId) {
      Alert.alert(t("mail.missingAccount"), t("mail.selectSendingAccount"))
      return
    }

    try {
      setIsSending(true)
      haptics.selection()

      const targetDraftId = await persistDraftWithAttachments()
      await sendDraftMutation.mutateAsync({ id: targetDraftId })
      haptics.success()
      router.back()
    } catch (err: unknown) {
      const e = err as Error
      Alert.alert(
        t("mail.failedToSend"),
        e.message || t("mail.unexpectedSendError")
      )
    } finally {
      setIsSending(false)
    }
  }

  const handleClose = () => {
    if (!isDirty) {
      router.back()
      return
    }
    Alert.alert(
      t("mail.unsavedChangesTitle"),
      t("mail.unsavedChangesMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.discard"),
          style: "destructive",
          onPress: () => router.back(),
        },
        {
          text: t("mail.saveDraft"),
          onPress: async () => {
            if (!selectedAccountId) {
              Alert.alert(
                t("mail.missingAccount"),
                t("mail.selectAccountBeforeDraft")
              )
              return
            }
            try {
              setIsSending(true)
              await persistDraftWithAttachments()
              haptics.success()
              router.back()
            } catch (err: unknown) {
              const e = err as Error
              Alert.alert(
                t("mail.failedToSaveDraft"),
                e.message || t("mail.couldNotSaveDraft")
              )
            } finally {
              setIsSending(false)
            }
          },
        },
      ]
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <View style={styles.container}>
        {/* Modal Top Bar */}
        <View
          style={[
            styles.topBar,
            { paddingTop: insets.top > 0 ? insets.top + 8 : 12 },
          ]}
        >
          <Pressable
            testID="mobile-composer-close-btn"
            onPress={handleClose}
            style={styles.iconBtn}
          >
            <X size={20} color={colors.textPrimary} />
          </Pressable>

          <Text style={styles.topBarTitle}>
            {params.mode === "DRAFT_MODE_FORWARD"
              ? t("mail.forwardMessage")
              : params.mode?.includes("REPLY")
                ? t("mail.replyMessage")
                : t("mail.newMessage")}
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
                color={colors.primaryForeground}
              />
            ) : (
              <>
                <Send size={15} color={colors.primaryForeground} />
                <Text style={styles.sendBtnText}>{t("mail.send")}</Text>
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
            <Text style={styles.fieldLabel}>{t("mail.fromLabel")}</Text>
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
                        { backgroundColor: acc.color || colors.primary },
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
            label={t("mail.toLabelShort")}
            testID="mobile-composer-to-input"
            recipients={toRecipients}
            onChangeRecipients={(next) => {
              setToRecipients(next)
              setIsDirty(true)
            }}
            placeholder={t("mail.addRecipientEmail")}
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
                onChangeRecipients={(next) => {
                  setCcRecipients(next)
                  setIsDirty(true)
                }}
                placeholder="Cc..."
              />
              <RecipientInput
                label="Bcc"
                recipients={bccRecipients}
                onChangeRecipients={(next) => {
                  setBccRecipients(next)
                  setIsDirty(true)
                }}
                placeholder="Bcc..."
              />
            </>
          )}

          {/* Subject Line */}
          <View style={styles.subjectRow}>
            <Text style={styles.fieldLabel}>{t("mail.subjectLabel")}</Text>
            <TextInput
              testID="mobile-composer-subject-input"
              value={subject}
              onChangeText={(text) => {
                setSubject(text)
                setIsDirty(true)
              }}
              placeholder={t("mail.subjectPlaceholder")}
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={isDark ? "dark" : "light"}
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
                    <Paperclip size={14} color={colors.primary} />
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
                      <Trash2 size={13} color={colors.destructive} />
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
                { cmd: "bold", label: t("mail.format.bold"), Icon: Bold },
                { cmd: "italic", label: t("mail.format.italic"), Icon: Italic },
                {
                  cmd: "underline",
                  label: t("mail.format.underline"),
                  Icon: Underline,
                },
                {
                  cmd: "strike",
                  label: t("mail.format.strike"),
                  Icon: Strikethrough,
                },
                {
                  cmd: "heading2",
                  label: t("mail.format.heading"),
                  Icon: Heading2,
                },
                {
                  cmd: "bulletList",
                  label: t("mail.format.bulletList"),
                  Icon: List,
                },
                {
                  cmd: "orderedList",
                  label: t("mail.format.orderedList"),
                  Icon: ListOrdered,
                },
                {
                  cmd: "blockquote",
                  label: t("mail.format.blockquote"),
                  Icon: Quote,
                },
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
                    color={isActive ? colors.primary : colors.textMuted}
                  />
                </Pressable>
              )
            })}
          </ScrollView>

          {/* Remote Images Hidden Banner */}
          {preparedContent.hasRemoteImages &&
            !mailAutoLoadRemoteContent &&
            !remoteImagesRevealed && (
              <View style={styles.remoteBanner}>
                <View style={styles.remoteBannerLeft}>
                  <ImageIcon size={14} color={colors.warning} />
                  <Text style={styles.remoteBannerText}>
                    {t("mail.remoteImagesHidden")}
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
                  <Text style={styles.remoteBannerAction}>
                    {t("mail.showImages")}
                  </Text>
                </Pressable>
              </View>
            )}

          {/* Unified Editable HTML Composer */}
          <EmailRichEditor
            ref={editorRef}
            testID="mobile-composer-body-input"
            bodyHtml={preparedContent.bodyHtml}
            stylesHtml={preparedContent.stylesHtml}
            placeholder={t("mail.composePlaceholder")}
            minHeight={240}
            autoFocus={true}
            onContentChange={() => setIsDirty(true)}
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
            <Paperclip size={18} color={colors.textPrimary} />
            <Text style={styles.toolbarBtnText}>{t("mail.attachFile")}</Text>
          </Pressable>

          {(saveDraftMutation.isPending || draftId) && (
            <Text style={styles.draftIndicatorText}>
              {saveDraftMutation.isPending
                ? t("mail.savingDraft")
                : t("mail.draft")}
            </Text>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  keyboardContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  topBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  iconBtn: {
    padding: 6,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  sendBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: t.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: t.radius.full,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    paddingBottom: 40,
  },
  fromRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  fieldLabel: {
    fontSize: 13,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
    width: 60,
  },
  accountPills: {
    gap: 6,
    alignItems: "center" as const,
  },
  accountPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  accountPillActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  accDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  accountPillText: {
    fontSize: 12,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  accountPillTextActive: {
    color: t.colors.primary,
    fontWeight: "700" as const,
  },
  ccBccToggle: {
    alignSelf: "flex-end" as const,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  ccBccToggleText: {
    fontSize: 12,
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
  subjectRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  subjectInput: {
    flex: 1,
    fontSize: 14,
    color: t.colors.textPrimary,
    fontWeight: "600" as const,
    paddingVertical: 4,
  },
  attachmentsSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
  },
  attItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  attFilename: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flex: 1,
  },
  attSize: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
  attRemoveBtn: {
    padding: 2,
  },
  formattingBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    backgroundColor: t.colors.surface,
    maxHeight: 42,
  },
  formattingBarContent: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  formatBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: t.radius.xs,
  },
  formatBtnActive: {
    backgroundColor: t.colors.primarySubtle,
  },
  remoteBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  remoteBannerLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  remoteBannerText: {
    fontSize: 12,
    color: t.colors.warning,
    fontWeight: "500" as const,
    flexShrink: 1,
  },
  remoteBannerAction: {
    fontSize: 12,
    color: t.colors.warning,
    fontWeight: "700" as const,
    textDecorationLine: "underline" as const,
  },
  bottomToolbar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  toolbarBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    backgroundColor: t.colors.surfaceHighlight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.sm,
  },
  toolbarBtnText: {
    fontSize: 12,
    color: t.colors.textPrimary,
    fontWeight: "500" as const,
  },
  draftIndicatorText: {
    fontSize: 11,
    color: t.colors.textMuted,
  },
})
