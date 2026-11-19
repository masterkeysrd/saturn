import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  PaperclipIcon,
  SendHorizontalIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import {
  type ChangeEvent,
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
  useRef,
} from "react"

export interface PromptInputAttachment {
  id: string
  file: File
  filename: string
  contentType: string
}

export interface PromptInputProps extends Omit<
  ComponentProps<"form">,
  "onSubmit"
> {
  value: string
  onValueChange: (value: string) => void
  onSubmitMessage: () => void
  isStreaming?: boolean
  onStop?: () => void
  attachments?: PromptInputAttachment[]
  onAddAttachments?: (files: File[]) => void
  onRemoveAttachment?: (id: string) => void
  placeholder?: string
  disabled?: boolean
  toolbarLeft?: React.ReactNode
  contextChips?: React.ReactNode
  acceptAttachments?: string
}

export function PromptInput({
  value,
  onValueChange,
  onSubmitMessage,
  isStreaming = false,
  onStop,
  attachments = [],
  onAddAttachments,
  onRemoveAttachment,
  placeholder = "Ask anything about your workspace...",
  disabled = false,
  toolbarLeft,
  contextChips,
  acceptAttachments = "image/png,image/jpeg,image/webp,application/pdf,text/csv,text/plain",
  className,
  ...props
}: PromptInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSubmit =
    !disabled &&
    !isStreaming &&
    (value.trim().length > 0 || attachments.length > 0)

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isStreaming) {
      onStop?.()
      return
    }
    if (canSubmit) {
      onSubmitMessage()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSubmit) {
        onSubmitMessage()
      }
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (list && list.length > 0 && onAddAttachments) {
      onAddAttachments(Array.from(list))
    }
    e.target.value = ""
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-control p-2.5 shadow-2xs focus-within:border-ring",
        className
      )}
      {...props}
    >
      {contextChips && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          {contextChips}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {attachments.map((att) => (
            <span
              key={att.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-0.5 text-xs"
            >
              <span className="max-w-[160px] truncate">{att.filename}</span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${att.filename}`}
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <textarea
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label={placeholder}
        className="max-h-40 min-h-[38px] w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
      />

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {onAddAttachments && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={acceptAttachments}
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isStreaming}
                title="Attach file"
                aria-label="Attach file"
                className="size-8 cursor-pointer rounded-lg text-muted-foreground hover:text-foreground"
              >
                <PaperclipIcon className="size-4" />
              </Button>
            </>
          )}
          {toolbarLeft}
        </div>

        {isStreaming ? (
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            onClick={onStop}
            aria-label="Stop generation"
            title="Stop generation"
            className="size-8 shrink-0 cursor-pointer rounded-lg"
          >
            <SquareIcon className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon-sm"
            disabled={!canSubmit}
            aria-label="Send message"
            title="Send message"
            className="size-8 shrink-0 cursor-pointer rounded-lg"
          >
            <SendHorizontalIcon className="size-4" />
          </Button>
        )}
      </div>
    </form>
  )
}
