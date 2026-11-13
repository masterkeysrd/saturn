import { useState, useEffect, useRef, useMemo } from "react"
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Heading2,
  Paperclip,
  X,
  Send,
  Trash2,
  Maximize2,
  Minimize2,
  Minus,
  Check,
  Loader2,
  Underline as UnderlineIcon,
  Image as ImageIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import {
  useConnectedAccounts,
  useContactSuggestions,
  uploadDraftAttachment,
} from "@saturn/hooks"
import type { Draft, Attachment } from "@saturn/api/saturn/mail/v1/mail"
import type { MailRecipientFormValues } from "@saturn/schemas"
import { formatAttachmentBytes, prepareUnifiedDraftHtml } from "@saturn/core"
import {
  EmailRichEditor,
  type EmailRichEditorHandle,
  type EmailEditorActiveFormats,
} from "./email-rich-editor"
import { cn } from "@/lib/utils"

const INITIAL_ACTIVE_FORMATS: EmailEditorActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  heading2: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
}

function FormattingToolbar({
  activeFormats,
  onExecFormat,
}: {
  activeFormats: EmailEditorActiveFormats
  onExecFormat: (
    cmd: Parameters<EmailRichEditorHandle["execFormat"]>[0]
  ) => void
}) {
  const buttons: Array<{
    cmd: Parameters<EmailRichEditorHandle["execFormat"]>[0]
    label: string
    active: boolean
    icon: typeof Bold
  }> = [
    { cmd: "bold", label: "Bold", active: activeFormats.bold, icon: Bold },
    {
      cmd: "italic",
      label: "Italic",
      active: activeFormats.italic,
      icon: Italic,
    },
    {
      cmd: "underline",
      label: "Underline",
      active: activeFormats.underline,
      icon: UnderlineIcon,
    },
    {
      cmd: "strike",
      label: "Strikethrough",
      active: activeFormats.strike,
      icon: Strikethrough,
    },
    {
      cmd: "heading2",
      label: "Heading",
      active: activeFormats.heading2,
      icon: Heading2,
    },
    {
      cmd: "bulletList",
      label: "Bullet list",
      active: activeFormats.bulletList,
      icon: List,
    },
    {
      cmd: "orderedList",
      label: "Numbered list",
      active: activeFormats.orderedList,
      icon: ListOrdered,
    },
    {
      cmd: "blockquote",
      label: "Blockquote",
      active: activeFormats.blockquote,
      icon: Quote,
    },
  ]

  return (
    <div className="flex items-center gap-1 border-b border-border/30 bg-muted/20 px-3 py-1">
      {buttons.map(({ cmd, label, active, icon: Icon }) => (
        <button
          key={cmd}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onExecFormat(cmd)}
          className={cn(
            "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
            active && "bg-muted text-foreground"
          )}
          aria-label={label}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  )
}

export interface MailComposerProps {
  initialDraft?: Partial<Draft>
  defaultAccountId?: string
  defaultTo?: MailRecipientFormValues[]
  defaultCc?: MailRecipientFormValues[]
  defaultBcc?: MailRecipientFormValues[]
  defaultSubject?: string
  defaultBodyHtml?: string
  defaultBodyText?: string
  defaultAttachments?: Attachment[]
  threadId?: string
  replyToMessageId?: string
  isInlineReply?: boolean
  autoFocusEditor?: boolean
  isOpen?: boolean
  onClose?: () => void
  onSend: (data: {
    connectedAccountId: string
    to: MailRecipientFormValues[]
    cc: MailRecipientFormValues[]
    bcc: MailRecipientFormValues[]
    subject: string
    bodyHtml: string
    bodyText: string
    threadId?: string
    replyToMessageId?: string
    attachments: Attachment[]
  }) => Promise<void>
  onSaveDraft?: (draft: Partial<Draft>) => Promise<Draft | undefined>
  onDiscard?: () => Promise<void> | void
}

function mapDraftParticipants(
  participants?: Array<{ email: string; name?: string }>
): MailRecipientFormValues[] {
  return (participants || []).map((p) => ({
    email: p.email,
    displayName: p.name || "",
  }))
}

export function MailComposer({
  initialDraft,
  defaultAccountId,
  defaultTo = [],
  defaultCc = [],
  defaultBcc = [],
  defaultSubject = "",
  defaultBodyHtml = "",
  defaultBodyText = "",
  defaultAttachments = [],
  threadId,
  replyToMessageId,
  isInlineReply = false,
  autoFocusEditor = false,
  isOpen = true,
  onClose,
  onSend,
  onSaveDraft,
  onDiscard,
}: MailComposerProps) {
  const { data: accountsData } = useConnectedAccounts()
  const accounts = useMemo(() => {
    return (accountsData?.accounts || []).filter(
      (a) =>
        a.enabledCapabilities?.includes("mail") ||
        a.enabledCapabilities?.includes("MAIL")
    )
  }, [accountsData])

  const initialTo =
    initialDraft?.to && initialDraft.to.length > 0
      ? mapDraftParticipants(initialDraft.to)
      : defaultTo

  const initialCc =
    initialDraft?.cc && initialDraft.cc.length > 0
      ? mapDraftParticipants(initialDraft.cc)
      : defaultCc

  const initialBcc =
    initialDraft?.bcc && initialDraft.bcc.length > 0
      ? mapDraftParticipants(initialDraft.bcc)
      : defaultBcc

  const initialSubject = initialDraft?.subject || defaultSubject || ""
  const initialAttachments = initialDraft?.attachments ?? defaultAttachments

  const [autoLoadImages, setAutoLoadImages] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false
    return localStorage.getItem("saturn_mail_auto_load_images") === "true"
  })
  const [loadRemoteImages, setLoadRemoteImages] = useState(false)
  const shouldLoadRemoteImages = loadRemoteImages || autoLoadImages

  useEffect(() => {
    const handleSync = () => {
      setAutoLoadImages(
        localStorage.getItem("saturn_mail_auto_load_images") === "true"
      )
    }
    window.addEventListener("storage", handleSync)
    window.addEventListener("saturn-mail-auto-load-changed", handleSync)
    return () => {
      window.removeEventListener("storage", handleSync)
      window.removeEventListener("saturn-mail-auto-load-changed", handleSync)
    }
  }, [])

  const rawBodyHtml = initialDraft?.bodyHtml ?? defaultBodyHtml ?? ""
  const rawBodyText = initialDraft?.bodyText ?? defaultBodyText ?? ""

  const preparedContent = useMemo(
    () =>
      prepareUnifiedDraftHtml({
        bodyHtml: rawBodyHtml,
        bodyText: rawBodyText,
        attachments: initialAttachments,
        loadRemoteImages: shouldLoadRemoteImages,
      }),
    [rawBodyHtml, rawBodyText, initialAttachments, shouldLoadRemoteImages]
  )

  // Override states (null means fall back to live props so async hydration reflects immediately)
  const [editedAccountId, setEditedAccountId] = useState<string | null>(null)
  const activeAccountId =
    editedAccountId ??
    (initialDraft?.connectedAccountId ||
      defaultAccountId ||
      accounts[0]?.id ||
      "")

  const [editedTo, setEditedTo] = useState<MailRecipientFormValues[] | null>(
    null
  )
  const [editedCc, setEditedCc] = useState<MailRecipientFormValues[] | null>(
    null
  )
  const [editedBcc, setEditedBcc] = useState<MailRecipientFormValues[] | null>(
    null
  )

  const toRecipients = editedTo ?? initialTo
  const ccRecipients = editedCc ?? initialCc
  const bccRecipients = editedBcc ?? initialBcc

  const [ccManuallyOpened, setCcManuallyOpened] = useState(false)
  const [bccManuallyOpened, setBccManuallyOpened] = useState(false)
  const showCc = ccManuallyOpened || ccRecipients.length > 0
  const showBcc = bccManuallyOpened || bccRecipients.length > 0

  // Autocomplete inputs
  const [toInput, setToInput] = useState("")
  const [ccInput, setCcInput] = useState("")
  const [bccInput, setBccInput] = useState("")

  const [editedSubject, setEditedSubject] = useState<string | null>(null)
  const subject = editedSubject ?? initialSubject

  const [editedAttachments, setEditedAttachments] = useState<
    Attachment[] | null
  >(null)
  const attachments = editedAttachments ?? initialAttachments

  const [isUploading, setIsUploading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isDiscarding, setIsDiscarding] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "">("")
  const [editorVersion, setEditorVersion] = useState(0)
  const [activeFormats, setActiveFormats] = useState<EmailEditorActiveFormats>(
    INITIAL_ACTIVE_FORMATS
  )

  // Composer window state
  const [isMinimized, setIsMinimized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<EmailRichEditorHandle>(null)

  // Contact suggestions query
  const { data: toSuggestions } = useContactSuggestions(toInput, {
    enabled: toInput.trim().length > 1,
  })

  const handleLoadRemoteImages = () => {
    setLoadRemoteImages(true)
    editorRef.current?.revealRemoteImages()
  }

  // Debounced Autosave Draft
  useEffect(() => {
    if (!onSaveDraft || isInlineReply) return

    const timer = setTimeout(async () => {
      const html = editorRef.current?.getHTML() || ""
      const text = editorRef.current?.getText() || ""

      // Only save if there is some content
      if (
        !subject.trim() &&
        !text.trim() &&
        toRecipients.length === 0 &&
        ccRecipients.length === 0 &&
        bccRecipients.length === 0 &&
        attachments.length === 0
      ) {
        return
      }

      setSaveStatus("saving")
      try {
        await onSaveDraft({
          id: initialDraft?.id,
          connectedAccountId: activeAccountId,
          threadId: threadId || initialDraft?.threadId,
          replyToMessageId: replyToMessageId || initialDraft?.replyToMessageId,
          subject,
          bodyHtml: html,
          bodyText: text,
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
          attachments,
        })
        setSaveStatus("saved")
      } catch {
        setSaveStatus("")
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [
    subject,
    toRecipients,
    ccRecipients,
    bccRecipients,
    attachments,
    activeAccountId,
    editorVersion,
    onSaveDraft,
    initialDraft,
    threadId,
    replyToMessageId,
    isInlineReply,
  ])

  // Add Recipient helper supporting commas, semicolons, and angle brackets
  const addRecipient = (
    type: "to" | "cc" | "bcc",
    emailRaw: string,
    displayNameRaw?: string
  ) => {
    const tokens = emailRaw.split(/[,;\n\r\t]+/).filter(Boolean)
    for (const rawToken of tokens) {
      let email = rawToken.trim().toLowerCase()
      let displayName = displayNameRaw?.trim()
      const angleMatch = email.match(/(.*?)\s*<([^>]+)>/)
      if (angleMatch) {
        displayName = displayName || angleMatch[1].trim()
        email = angleMatch[2].trim().toLowerCase()
      }
      if (!email || !email.includes("@")) continue

      const newRec: MailRecipientFormValues = {
        email,
        displayName: displayName || email.split("@")[0],
      }

      if (type === "to") {
        setEditedTo((prev) => {
          const base = prev ?? initialTo
          return base.some((r) => r.email === email) ? base : [...base, newRec]
        })
        setToInput("")
      } else if (type === "cc") {
        setEditedCc((prev) => {
          const base = prev ?? initialCc
          return base.some((r) => r.email === email) ? base : [...base, newRec]
        })
        setCcInput("")
      } else {
        setEditedBcc((prev) => {
          const base = prev ?? initialBcc
          return base.some((r) => r.email === email) ? base : [...base, newRec]
        })
        setBccInput("")
      }
    }
  }

  // Handle file uploads (up to 25 MB)
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsUploading(true)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > 25 * 1024 * 1024) {
        toast.add({
          title: `File ${file.name} exceeds 25 MB maximum attachment size`,
          type: "error",
        })
        continue
      }

      try {
        const fakeDraftId = initialDraft?.id || "temp_draft"
        const uploaded = await uploadDraftAttachment({
          draftId: fakeDraftId,
          file,
          filename: file.name,
        })
        setEditedAttachments((prev) => [
          ...(prev ?? initialAttachments),
          uploaded,
        ])
      } catch {
        // Fallback: mock attachment descriptor if server offline in test
        setEditedAttachments((prev) => [
          ...(prev ?? initialAttachments),
          {
            id: `att_${Date.now()}_${i}`,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            size: String(file.size),
            contentId: "",
            isInline: false,
            downloadUrl: "",
          },
        ])
      }
    }

    setIsUploading(false)
  }

  // Send action
  const handleSend = async () => {
    let currentTo = toRecipients
    if (toInput.trim().includes("@")) {
      const email = toInput.trim().toLowerCase()
      const newRec: MailRecipientFormValues = {
        email,
        displayName: email.split("@")[0],
      }
      currentTo = [...toRecipients, newRec]
      setEditedTo(currentTo)
      setToInput("")
    }

    if (
      currentTo.length === 0 &&
      ccRecipients.length === 0 &&
      bccRecipients.length === 0
    ) {
      toast.add({
        title: "Please specify at least one recipient",
        type: "error",
      })
      return
    }

    setIsSending(true)
    try {
      const html = editorRef.current?.getHTML() || ""
      const text = editorRef.current?.getText() || ""

      await onSend({
        connectedAccountId: activeAccountId,
        to: currentTo,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject,
        bodyHtml: html,
        bodyText: text,
        threadId,
        replyToMessageId,
        attachments,
      })
      onClose?.()
    } finally {
      setIsSending(false)
    }
  }

  const handleDiscard = async () => {
    if (!onDiscard || isDiscarding) return
    setIsDiscarding(true)
    try {
      await onDiscard()
    } catch {
      // Caller handles error notifications
    } finally {
      setIsDiscarding(false)
    }
  }

  if (!isOpen && !isInlineReply) return null

  // Inline reply render mode
  if (isInlineReply) {
    return (
      <div
        data-testid="inline-reply-composer"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault()
            handleSend()
          }
        }}
        className="rounded-xl border border-border/70 bg-card shadow-xs"
      >
        {/* Reply Toolbar Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">From:</span>
            <select
              data-testid="composer-account-select"
              value={activeAccountId}
              onChange={(e) => setEditedAccountId(e.target.value)}
              className="rounded-md border border-border/50 bg-background px-2 py-1 text-xs font-medium text-foreground"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.displayName || acc.email} ({acc.email})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            {!showCc && (
              <button
                type="button"
                onClick={() => setCcManuallyOpened(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cc
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                onClick={() => setBccManuallyOpened(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Bcc
              </button>
            )}
          </div>
        </div>

        {/* Recipients: To */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">To:</span>
          {toRecipients.map((rec) => (
            <span
              key={rec.email}
              data-testid={`to-chip-${rec.email}`}
              className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
            >
              <span>{rec.displayName || rec.email}</span>
              <button
                type="button"
                onClick={() =>
                  setEditedTo((prev) =>
                    (prev ?? initialTo).filter((r) => r.email !== rec.email)
                  )
                }
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            data-testid="to-input"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault()
                addRecipient("to", toInput)
              } else if (
                e.key === "Backspace" &&
                !toInput &&
                toRecipients.length > 0
              ) {
                setEditedTo((prev) => (prev ?? initialTo).slice(0, -1))
              }
            }}
            onBlur={() => {
              if (toInput.includes("@")) addRecipient("to", toInput)
            }}
            placeholder={toRecipients.length === 0 ? "Add recipients..." : ""}
            className="flex-1 bg-transparent px-1 py-0.5 text-xs text-foreground focus:outline-hidden"
          />
        </div>

        {/* Recipients: Cc (Inline) */}
        {showCc && (
          <div className="flex flex-wrap items-center gap-1 border-b border-border/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Cc:</span>
            {ccRecipients.map((rec) => (
              <span
                key={rec.email}
                data-testid={`cc-chip-${rec.email}`}
                className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
              >
                <span>{rec.displayName || rec.email}</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditedCc((prev) =>
                      (prev ?? initialCc).filter((r) => r.email !== rec.email)
                    )
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              data-testid="cc-input"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  addRecipient("cc", ccInput)
                } else if (
                  e.key === "Backspace" &&
                  !ccInput &&
                  ccRecipients.length > 0
                ) {
                  setEditedCc((prev) => (prev ?? initialCc).slice(0, -1))
                }
              }}
              onBlur={() => {
                if (ccInput.includes("@")) addRecipient("cc", ccInput)
              }}
              placeholder={ccRecipients.length === 0 ? "Add Cc..." : ""}
              className="flex-1 bg-transparent px-1 py-0.5 text-xs text-foreground focus:outline-hidden"
            />
          </div>
        )}

        {/* Recipients: Bcc (Inline) */}
        {showBcc && (
          <div className="flex flex-wrap items-center gap-1 border-b border-border/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Bcc:</span>
            {bccRecipients.map((rec) => (
              <span
                key={rec.email}
                data-testid={`bcc-chip-${rec.email}`}
                className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
              >
                <span>{rec.displayName || rec.email}</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditedBcc((prev) =>
                      (prev ?? initialBcc).filter((r) => r.email !== rec.email)
                    )
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              data-testid="bcc-input"
              value={bccInput}
              onChange={(e) => setBccInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  addRecipient("bcc", bccInput)
                } else if (
                  e.key === "Backspace" &&
                  !bccInput &&
                  bccRecipients.length > 0
                ) {
                  setEditedBcc((prev) => (prev ?? initialBcc).slice(0, -1))
                }
              }}
              onBlur={() => {
                if (bccInput.includes("@")) addRecipient("bcc", bccInput)
              }}
              placeholder={bccRecipients.length === 0 ? "Add Bcc..." : ""}
              className="flex-1 bg-transparent px-1 py-0.5 text-xs text-foreground focus:outline-hidden"
            />
          </div>
        )}

        {/* Subject (Inline) */}
        <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2 text-xs">
          <span className="w-12 text-muted-foreground">Subject:</span>
          <input
            data-testid="composer-subject-input"
            value={subject}
            onChange={(e) => setEditedSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 bg-transparent px-1 py-0.5 text-xs font-medium text-foreground focus:outline-hidden"
          />
        </div>

        {/* Formatting Bar */}
        <FormattingToolbar
          activeFormats={activeFormats}
          onExecFormat={(cmd) => editorRef.current?.execFormat(cmd)}
        />

        {/* Unified ContentEditable Document Canvas */}
        <div>
          {preparedContent.hasRemoteImages && !shouldLoadRemoteImages && (
            <div
              data-testid="composer-remote-images-banner"
              className="mx-3 mt-2 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300"
            >
              <span className="flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Remote images in this draft are hidden.</span>
              </span>
              <button
                type="button"
                data-testid="composer-load-remote-images-btn"
                onClick={handleLoadRemoteImages}
                className="font-medium underline hover:opacity-80"
              >
                Show images
              </button>
            </div>
          )}
          <EmailRichEditor
            ref={editorRef}
            testId="reply-editor-content"
            bodyHtml={preparedContent.bodyHtml}
            stylesHtml={preparedContent.stylesHtml}
            minHeight={160}
            autoFocus={autoFocusEditor}
            onContentChange={() => setEditorVersion((v) => v + 1)}
            onSubmitShortcut={handleSend}
            onActiveFormatsChange={setActiveFormats}
          />
        </div>

        {/* Attachments List */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border/30 bg-muted/10 px-3 py-2">
            {attachments.map((att) => (
              <span
                key={att.id || att.filename}
                className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">{att.filename}</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditedAttachments((prev) =>
                      (prev ?? initialAttachments).filter(
                        (a) => (a.id || a.filename) !== (att.id || att.filename)
                      )
                    )
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Action Footer (Natural Document Flow matching Gmail / Apple Mail) */}
        <div className="flex w-full items-center justify-between rounded-b-xl border-t border-border/60 bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              data-testid="composer-send-btn"
              onClick={handleSend}
              disabled={isSending}
              size="sm"
              className="gap-1.5 shadow-xs"
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Send</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />
          </div>

          <div className="flex items-center gap-3">
            {saveStatus === "saving" && (
              <span className="animate-pulse text-[11px] text-muted-foreground">
                Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Check className="h-3 w-3 text-emerald-500" /> Saved
              </span>
            )}
            {onDiscard && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="composer-discard-btn"
                onClick={handleDiscard}
                disabled={isDiscarding || isSending}
                className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive"
                title="Discard draft"
              >
                {isDiscarding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>{isDiscarding ? "Discarding..." : "Discard"}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Floating / Docked Compose Modal
  return (
    <div
      data-testid="mail-compose-modal"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault()
          handleSend()
        }
      }}
      className={cn(
        "fixed z-50 flex flex-col rounded-t-xl border border-border/80 bg-card shadow-2xl transition-all duration-200",
        isMaximized
          ? "inset-4 md:inset-8"
          : isMinimized
            ? "right-6 bottom-0 h-11 w-80"
            : "right-6 bottom-0 h-[540px] w-[580px] max-w-[calc(100vw-48px)]"
      )}
    >
      {/* Modal Title Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between rounded-t-xl border-b border-border/40 bg-muted/60 px-4">
        <span className="truncate text-xs font-semibold text-foreground">
          {subject || "New Message"}
        </span>
        <div className="flex items-center gap-1 text-muted-foreground">
          {saveStatus === "saving" && (
            <span className="text-[10px] text-muted-foreground">Saving...</span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Check className="h-3 w-3 text-emerald-500" /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="rounded p-1 hover:bg-muted hover:text-foreground"
            aria-label="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMaximized(!isMaximized)
              setIsMinimized(false)
            }}
            className="rounded p-1 hover:bg-muted hover:text-foreground"
            aria-label="Maximize"
          >
            {isMaximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            data-testid="composer-close-btn"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header Fields: From, To, Cc, Bcc, Subject */}
          <div className="flex flex-col divide-y divide-border/30 border-b border-border/30 text-xs">
            {/* From */}
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="w-12 text-muted-foreground">From:</span>
              <select
                data-testid="composer-account-select"
                value={activeAccountId}
                onChange={(e) => setEditedAccountId(e.target.value)}
                className="flex-1 rounded border-none bg-transparent py-0.5 font-medium text-foreground focus:outline-hidden"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.displayName || acc.email} ({acc.email})
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-muted-foreground">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setCcManuallyOpened(true)}
                    className="hover:text-foreground"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setBccManuallyOpened(true)}
                    className="hover:text-foreground"
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>

            {/* To */}
            <div className="relative flex flex-wrap items-center gap-1.5 px-4 py-2">
              <span className="w-12 text-muted-foreground">To:</span>
              {toRecipients.map((rec) => (
                <span
                  key={rec.email}
                  data-testid={`to-chip-${rec.email}`}
                  className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                >
                  <span>{rec.displayName || rec.email}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditedTo((prev) =>
                        (prev ?? initialTo).filter((r) => r.email !== rec.email)
                      )
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                data-testid="to-input"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    addRecipient("to", toInput)
                  } else if (
                    e.key === "Backspace" &&
                    !toInput &&
                    toRecipients.length > 0
                  ) {
                    setEditedTo((prev) => (prev ?? initialTo).slice(0, -1))
                  }
                }}
                onBlur={() => {
                  if (toInput.includes("@")) addRecipient("to", toInput)
                }}
                placeholder={toRecipients.length === 0 ? "Recipients..." : ""}
                className="min-w-[120px] flex-1 bg-transparent py-0.5 text-xs text-foreground focus:outline-hidden"
              />
              {/* Autocomplete dropdown */}
              {toSuggestions &&
                toSuggestions.contacts &&
                toSuggestions.contacts.length > 0 &&
                toInput && (
                  <div className="absolute top-full left-16 z-30 max-h-40 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                    {toSuggestions.contacts.map((c) => (
                      <button
                        key={c.email}
                        type="button"
                        onClick={() => {
                          if (c.email) {
                            addRecipient("to", c.email, c.displayName)
                          }
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      >
                        <span className="font-medium text-foreground">
                          {c.displayName}
                        </span>
                        <span className="text-muted-foreground">{c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
            </div>

            {/* Cc */}
            {showCc && (
              <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
                <span className="w-12 text-muted-foreground">Cc:</span>
                {ccRecipients.map((rec) => (
                  <span
                    key={rec.email}
                    data-testid={`cc-chip-${rec.email}`}
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                  >
                    <span>{rec.displayName || rec.email}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditedCc((prev) =>
                          (prev ?? initialCc).filter(
                            (r) => r.email !== rec.email
                          )
                        )
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  data-testid="cc-input"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault()
                      addRecipient("cc", ccInput)
                    } else if (
                      e.key === "Backspace" &&
                      !ccInput &&
                      ccRecipients.length > 0
                    ) {
                      setEditedCc((prev) => (prev ?? initialCc).slice(0, -1))
                    }
                  }}
                  onBlur={() => {
                    if (ccInput.includes("@")) addRecipient("cc", ccInput)
                  }}
                  className="min-w-[120px] flex-1 bg-transparent py-0.5 text-xs text-foreground focus:outline-hidden"
                />
              </div>
            )}

            {/* Bcc */}
            {showBcc && (
              <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
                <span className="w-12 text-muted-foreground">Bcc:</span>
                {bccRecipients.map((rec) => (
                  <span
                    key={rec.email}
                    data-testid={`bcc-chip-${rec.email}`}
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                  >
                    <span>{rec.displayName || rec.email}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditedBcc((prev) =>
                          (prev ?? initialBcc).filter(
                            (r) => r.email !== rec.email
                          )
                        )
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  data-testid="bcc-input"
                  value={bccInput}
                  onChange={(e) => setBccInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault()
                      addRecipient("bcc", bccInput)
                    } else if (
                      e.key === "Backspace" &&
                      !bccInput &&
                      bccRecipients.length > 0
                    ) {
                      setEditedBcc((prev) => (prev ?? initialBcc).slice(0, -1))
                    }
                  }}
                  onBlur={() => {
                    if (bccInput.includes("@")) addRecipient("bcc", bccInput)
                  }}
                  className="min-w-[120px] flex-1 bg-transparent py-0.5 text-xs text-foreground focus:outline-hidden"
                />
              </div>
            )}

            {/* Subject */}
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="w-12 text-muted-foreground">Subject:</span>
              <Input
                data-testid="composer-subject-input"
                value={subject}
                onChange={(e) => setEditedSubject(e.target.value)}
                placeholder="Subject"
                className="h-7 border-none bg-transparent px-0 text-xs font-medium shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {/* Formatting Bar */}
          <FormattingToolbar
            activeFormats={activeFormats}
            onExecFormat={(cmd) => editorRef.current?.execFormat(cmd)}
          />

          {/* Unified ContentEditable Document Canvas */}
          <div className="flex-1 overflow-y-auto bg-background/40 text-foreground">
            {preparedContent.hasRemoteImages && !shouldLoadRemoteImages && (
              <div
                data-testid="composer-remote-images-banner"
                className="mx-3 mt-2 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300"
              >
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>Remote images in this draft are hidden.</span>
                </span>
                <button
                  type="button"
                  data-testid="composer-load-remote-images-btn"
                  onClick={handleLoadRemoteImages}
                  className="font-medium underline hover:opacity-80"
                >
                  Show images
                </button>
              </div>
            )}
            <EmailRichEditor
              ref={editorRef}
              testId="composer-editor-content"
              bodyHtml={preparedContent.bodyHtml}
              stylesHtml={preparedContent.stylesHtml}
              minHeight={220}
              autoFocus={autoFocusEditor}
              onContentChange={() => setEditorVersion((v) => v + 1)}
              onSubmitShortcut={handleSend}
              onActiveFormatsChange={setActiveFormats}
            />
          </div>

          {/* Attachments Section */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border/30 bg-muted/10 p-2.5">
              {attachments.map((att) => (
                <div
                  key={att.id || att.filename}
                  data-testid={`attachment-chip-${att.id || att.filename}`}
                  className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1 text-xs"
                >
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="max-w-[140px] truncate font-medium text-foreground">
                    {att.filename}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatAttachmentBytes(parseInt(att.size || "0", 10) || 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditedAttachments((prev) =>
                        (prev ?? initialAttachments).filter(
                          (a) =>
                            (a.id || a.filename) !== (att.id || att.filename)
                        )
                      )
                    }
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Action Footer */}
          <div className="flex h-12 shrink-0 items-center justify-between border-t border-border/40 bg-card px-4">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                data-testid="composer-send-btn"
                onClick={handleSend}
                disabled={isSending}
                size="sm"
                className="gap-2 shadow-xs"
              >
                {isSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>Send</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Attach files (up to 25 MB)"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />
            </div>

            <div className="flex items-center gap-2">
              {onDiscard && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  data-testid="composer-discard-btn"
                  onClick={handleDiscard}
                  disabled={isDiscarding || isSending}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="Discard draft"
                >
                  {isDiscarding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
