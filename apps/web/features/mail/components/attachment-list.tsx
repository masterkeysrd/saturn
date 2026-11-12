import {
  FileText,
  Image as ImageIcon,
  FileCode,
  FileArchive,
  Download,
  Paperclip,
} from "lucide-react"
import { formatAttachmentBytes } from "@saturn/core"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"

export interface AttachmentListProps {
  attachments: Attachment[]
  className?: string
}

function getAttachmentIcon(contentType: string) {
  const type = contentType.toLowerCase()
  if (type.startsWith("image/")) {
    return <ImageIcon className="h-4 w-4 shrink-0 text-sky-500" />
  }
  if (type.includes("pdf")) {
    return <FileText className="h-4 w-4 shrink-0 text-rose-500" />
  }
  if (
    type.includes("json") ||
    type.includes("javascript") ||
    type.includes("html") ||
    type.includes("xml")
  ) {
    return <FileCode className="h-4 w-4 shrink-0 text-amber-500" />
  }
  if (type.includes("zip") || type.includes("tar") || type.includes("gzip")) {
    return <FileArchive className="h-4 w-4 shrink-0 text-emerald-500" />
  }
  return <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
}

export function AttachmentList({
  attachments,
  className = "",
}: AttachmentListProps) {
  // Only display non-inline or download-ready attachments
  const validAttachments = attachments.filter((a) => !a.isInline)
  if (validAttachments.length === 0) return null

  return (
    <div
      data-testid="attachment-list"
      className={`flex flex-wrap gap-2 pt-2 ${className}`}
    >
      {validAttachments.map((att) => {
        const sizeBytes = parseInt(att.size || "0", 10) || 0
        const formattedSize = formatAttachmentBytes(sizeBytes)

        return (
          <a
            key={att.id || att.filename}
            href={att.downloadUrl || "#"}
            download={att.filename}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`attachment-chip-${att.id || att.filename}`}
            className="group flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-xs transition hover:border-border hover:bg-muted/60"
            title={`Download ${att.filename} (${formattedSize})`}
          >
            {getAttachmentIcon(att.contentType)}
            <div className="flex flex-col truncate">
              <span className="max-w-[180px] truncate font-medium text-foreground group-hover:text-primary">
                {att.filename}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formattedSize}
              </span>
            </div>
            <Download className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 transition group-hover:text-primary group-hover:opacity-100" />
          </a>
        )
      })}
    </div>
  )
}
