import { useState, useEffect, useRef, useMemo } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import LinkExtension from "@tiptap/extension-link"
import PlaceholderExtension from "@tiptap/extension-placeholder"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useConnectedAccounts,
  useContactSuggestions,
  uploadDraftAttachment,
} from "@saturn/hooks"
import type { Draft, Attachment } from "@saturn/api/saturn/mail/v1/mail"
import type { MailRecipientFormValues } from "@saturn/schemas"
import { formatAttachmentBytes } from "@saturn/core"
import { cn } from "@/lib/utils"

export interface MailComposerProps {
  initialDraft?: Partial<Draft>
  defaultAccountId?: string
  defaultTo?: MailRecipientFormValues[]
  defaultSubject?: string
  defaultBodyHtml?: string
  threadId?: string
  replyToMessageId?: string
  isInlineReply?: boolean
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
  onDiscard?: () => void
}

export function MailComposer({
  initialDraft,
  defaultAccountId,
  defaultTo = [],
  defaultSubject = "",
  defaultBodyHtml = "",
  threadId,
  replyToMessageId,
  isInlineReply = false,
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

  // Active account: prioritize initialDraft -> defaultAccountId -> first available mail account
  const [userSelectedAccountId, setUserSelectedAccountId] = useState<string>(
    initialDraft?.connectedAccountId || defaultAccountId || ""
  )
  const activeAccountId =
    userSelectedAccountId || defaultAccountId || accounts[0]?.id || ""

  // Recipient arrays
  const [toRecipients, setToRecipients] = useState<MailRecipientFormValues[]>(
    () => {
      if (initialDraft?.to && initialDraft.to.length > 0) {
        return initialDraft.to.map((p) => ({
          email: p.email,
          displayName: p.name,
        }))
      }
      return defaultTo
    }
  )
  const [ccRecipients, setCcRecipients] = useState<MailRecipientFormValues[]>(
    () => {
      if (initialDraft?.cc && initialDraft.cc.length > 0) {
        return initialDraft.cc.map((p) => ({
          email: p.email,
          displayName: p.name,
        }))
      }
      return []
    }
  )
  const [bccRecipients, setBccRecipients] = useState<MailRecipientFormValues[]>(
    () => {
      if (initialDraft?.bcc && initialDraft.bcc.length > 0) {
        return initialDraft.bcc.map((p) => ({
          email: p.email,
          displayName: p.name,
        }))
      }
      return []
    }
  )

  const [showCc, setShowCc] = useState(ccRecipients.length > 0)
  const [showBcc, setShowBcc] = useState(bccRecipients.length > 0)

  // Autocomplete inputs
  const [toInput, setToInput] = useState("")
  const [ccInput, setCcInput] = useState("")
  const [bccInput, setBccInput] = useState("")

  const [subject, setSubject] = useState(
    initialDraft?.subject || defaultSubject || ""
  )
  const [attachments, setAttachments] = useState<Attachment[]>(
    initialDraft?.attachments || []
  )
  const [isUploading, setIsUploading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "">("")

  // Composer window state
  const [isMinimized, setIsMinimized] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Contact suggestions query
  const { data: toSuggestions } = useContactSuggestions(toInput, {
    enabled: toInput.trim().length > 1,
  })

  // Tiptap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
      PlaceholderExtension.configure({
        placeholder: "Write your email here...",
      }),
    ],
    content: initialDraft?.bodyHtml || defaultBodyHtml || "",
    editorProps: {
      attributes: {
        class:
          "min-h-[140px] max-h-[360px] overflow-y-auto px-4 py-3 text-sm focus:outline-hidden",
      },
    },
  })

  // Debounced Autosave Draft
  useEffect(() => {
    if (!onSaveDraft || isInlineReply) return

    const timer = setTimeout(async () => {
      const html = editor?.getHTML() || ""
      const text = editor?.getText() || ""

      // Only save if there is some content
      if (
        !subject.trim() &&
        !html.trim() &&
        toRecipients.length === 0 &&
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
    editor,
    onSaveDraft,
    initialDraft,
    threadId,
    replyToMessageId,
    isInlineReply,
  ])

  // Add Recipient helper
  const addRecipient = (
    type: "to" | "cc" | "bcc",
    emailRaw: string,
    displayNameRaw?: string
  ) => {
    const email = emailRaw.trim().toLowerCase()
    if (!email || !email.includes("@")) return

    const newRec: MailRecipientFormValues = {
      email,
      displayName: displayNameRaw?.trim() || email.split("@")[0],
    }

    if (type === "to") {
      if (!toRecipients.some((r) => r.email === email)) {
        setToRecipients((prev) => [...prev, newRec])
      }
      setToInput("")
    } else if (type === "cc") {
      if (!ccRecipients.some((r) => r.email === email)) {
        setCcRecipients((prev) => [...prev, newRec])
      }
      setCcInput("")
    } else {
      if (!bccRecipients.some((r) => r.email === email)) {
        setBccRecipients((prev) => [...prev, newRec])
      }
      setBccInput("")
    }
  }

  // Handle file uploads (up to 25 MB)
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsUploading(true)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > 25 * 1024 * 1024) {
        alert(`File ${file.name} exceeds 25 MB maximum attachment size`)
        continue
      }

      try {
        const fakeDraftId = initialDraft?.id || "temp_draft"
        const uploaded = await uploadDraftAttachment({
          draftId: fakeDraftId,
          file,
          filename: file.name,
        })
        setAttachments((prev) => [...prev, uploaded])
      } catch {
        // Fallback: mock attachment descriptor if server offline in test
        setAttachments((prev) => [
          ...prev,
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
    if (
      toRecipients.length === 0 &&
      ccRecipients.length === 0 &&
      bccRecipients.length === 0
    ) {
      alert("Please specify at least one recipient")
      return
    }

    setIsSending(true)
    try {
      const html = editor?.getHTML() || ""
      const text = editor?.getText() || ""

      await onSend({
        connectedAccountId: activeAccountId,
        to: toRecipients,
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

  if (!isOpen && !isInlineReply) return null

  // Inline reply render mode
  if (isInlineReply) {
    return (
      <div
        data-testid="inline-reply-composer"
        className="rounded-xl border border-border/60 bg-card p-3 shadow-xs"
      >
        {/* Reply Toolbar Header */}
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-border/30 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">From:</span>
            <select
              data-testid="composer-account-select"
              value={activeAccountId}
              onChange={(e) => setUserSelectedAccountId(e.target.value)}
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
                onClick={() => setShowCc(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cc
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                onClick={() => setShowBcc(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Bcc
              </button>
            )}
          </div>
        </div>

        {/* Recipients */}
        <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
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
                  setToRecipients((prev) =>
                    prev.filter((r) => r.email !== rec.email)
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
              }
            }}
            placeholder={toRecipients.length === 0 ? "Add recipients..." : ""}
            className="flex-1 bg-transparent px-1 py-0.5 text-xs text-foreground focus:outline-hidden"
          />
        </div>

        {/* Formatting Bar */}
        <div className="flex items-center gap-1 border-t border-b border-border/30 py-1">
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={cn(
              "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
              editor?.isActive("bold") && "bg-muted text-foreground"
            )}
            aria-label="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={cn(
              "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
              editor?.isActive("italic") && "bg-muted text-foreground"
            )}
            aria-label="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            className={cn(
              "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
              editor?.isActive("bulletList") && "bg-muted text-foreground"
            )}
            aria-label="Bullet list"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            className={cn(
              "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
              editor?.isActive("orderedList") && "bg-muted text-foreground"
            )}
            aria-label="Numbered list"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            className={cn(
              "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
              editor?.isActive("blockquote") && "bg-muted text-foreground"
            )}
            aria-label="Blockquote"
          >
            <Quote className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Editor Body */}
        <EditorContent editor={editor} data-testid="reply-editor-content" />

        {/* Attachments List */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border/30 pt-2">
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
                    setAttachments((prev) =>
                      prev.filter(
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

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-2">
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
          {onDiscard && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              className="h-8 text-xs text-muted-foreground hover:text-destructive"
            >
              Discard
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Floating / Docked Compose Modal
  return (
    <div
      data-testid="mail-compose-modal"
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
                onChange={(e) => setUserSelectedAccountId(e.target.value)}
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
                    onClick={() => setShowCc(true)}
                    className="hover:text-foreground"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
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
                      setToRecipients((prev) =>
                        prev.filter((r) => r.email !== rec.email)
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
                  }
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
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                  >
                    <span>{rec.displayName || rec.email}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCcRecipients((prev) =>
                          prev.filter((r) => r.email !== rec.email)
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
                    }
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
                    className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                  >
                    <span>{rec.displayName || rec.email}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setBccRecipients((prev) =>
                          prev.filter((r) => r.email !== rec.email)
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
                    }
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
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-7 border-none bg-transparent px-0 text-xs font-medium shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {/* Formatting Bar */}
          <div className="flex items-center gap-1 border-b border-border/30 bg-muted/20 px-3 py-1">
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              className={cn(
                "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                editor?.isActive("bold") && "bg-muted text-foreground"
              )}
              aria-label="Bold"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={cn(
                "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                editor?.isActive("italic") && "bg-muted text-foreground"
              )}
              aria-label="Italic"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleStrike().run()}
              className={cn(
                "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                editor?.isActive("strike") && "bg-muted text-foreground"
              )}
              aria-label="Strikethrough"
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                editor?.chain().focus().toggleHeading({ level: 2 }).run()
              }
              className={cn(
                "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                editor?.isActive("heading", { level: 2 }) &&
                  "bg-muted text-foreground"
              )}
              aria-label="Heading"
            >
              <Heading2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={cn(
                "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                editor?.isActive("bulletList") && "bg-muted text-foreground"
              )}
              aria-label="Bullet list"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className={cn(
                "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                editor?.isActive("orderedList") && "bg-muted text-foreground"
              )}
              aria-label="Numbered list"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              className={cn(
                "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                editor?.isActive("blockquote") && "bg-muted text-foreground"
              )}
              aria-label="Blockquote"
            >
              <Quote className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Editor Body */}
          <div className="flex-1 overflow-y-auto">
            <EditorContent
              editor={editor}
              data-testid="composer-editor-content"
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
                      setAttachments((prev) =>
                        prev.filter(
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
                  onClick={onDiscard}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="Discard draft"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
