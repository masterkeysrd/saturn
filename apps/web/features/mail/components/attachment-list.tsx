import {
  FileText,
  Image as ImageIcon,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  Download,
  Paperclip,
} from "lucide-react"
import { formatAttachmentBytes } from "@saturn/core"
import type { Attachment } from "@saturn/api/saturn/mail/v1/mail"
import { cn } from "@/lib/utils"

export interface AttachmentListProps {
  attachments: Attachment[]
  className?: string
}

interface FileTypeBadge {
  icon: typeof FileText
  badgeBg: string
  badgeBorder: string
  iconColor: string
  label: string
}

function getFileTypeBadge(
  contentType: string,
  filename: string
): FileTypeBadge {
  const type = (contentType || "").toLowerCase()
  const ext = filename.includes(".")
    ? filename.split(".").pop()?.toLowerCase() || ""
    : ""

  // PDF Documents
  if (type.includes("pdf") || ext === "pdf") {
    return {
      icon: FileText,
      badgeBg: "bg-rose-50 dark:bg-rose-950/60",
      badgeBorder: "border-rose-200/80 dark:border-rose-900/60",
      iconColor: "text-rose-600 dark:text-rose-400",
      label: "PDF",
    }
  }

  // Spreadsheets / Data tables
  if (
    type.includes("sheet") ||
    type.includes("excel") ||
    type.includes("csv") ||
    ["xls", "xlsx", "csv"].includes(ext)
  ) {
    return {
      icon: FileSpreadsheet,
      badgeBg: "bg-emerald-50 dark:bg-emerald-950/60",
      badgeBorder: "border-emerald-200/80 dark:border-emerald-900/60",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      label: ext.toUpperCase() || "XLS",
    }
  }

  // Code, XML, JSON
  if (
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("javascript") ||
    type.includes("html") ||
    ["xml", "json", "js", "ts", "html", "css", "yaml", "yml"].includes(ext)
  ) {
    return {
      icon: FileCode,
      badgeBg: "bg-amber-50 dark:bg-amber-950/60",
      badgeBorder: "border-amber-200/80 dark:border-amber-900/60",
      iconColor: "text-amber-600 dark:text-amber-400",
      label: ext.toUpperCase() || "CODE",
    }
  }

  // Images
  if (
    type.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)
  ) {
    return {
      icon: ImageIcon,
      badgeBg: "bg-sky-50 dark:bg-sky-950/60",
      badgeBorder: "border-sky-200/80 dark:border-sky-900/60",
      iconColor: "text-sky-600 dark:text-sky-400",
      label: ext.toUpperCase() || "IMG",
    }
  }

  // Compressed Archives
  if (
    type.includes("zip") ||
    type.includes("tar") ||
    type.includes("gzip") ||
    type.includes("rar") ||
    type.includes("7z") ||
    ["zip", "rar", "7z", "tar", "gz", "tgz"].includes(ext)
  ) {
    return {
      icon: FileArchive,
      badgeBg: "bg-violet-50 dark:bg-violet-950/60",
      badgeBorder: "border-violet-200/80 dark:border-violet-900/60",
      iconColor: "text-violet-600 dark:text-violet-400",
      label: ext.toUpperCase() || "ZIP",
    }
  }

  // Fallback
  return {
    icon: Paperclip,
    badgeBg: "bg-zinc-100 dark:bg-zinc-800",
    badgeBorder: "border-zinc-200/80 dark:border-zinc-700",
    iconColor: "text-zinc-600 dark:text-zinc-300",
    label: ext ? ext.toUpperCase() : "FILE",
  }
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
      className={`flex flex-wrap gap-2.5 pt-3 ${className}`}
    >
      {validAttachments.map((att) => {
        const sizeBytes = parseInt(att.size || "0", 10) || 0
        const formattedSize = formatAttachmentBytes(sizeBytes)
        const fileBadge = getFileTypeBadge(att.contentType, att.filename)
        const Icon = fileBadge.icon

        return (
          <a
            key={att.id || att.filename}
            href={att.downloadUrl || "#"}
            download={att.filename}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`attachment-chip-${att.id || att.filename}`}
            className="group relative flex items-center gap-2.5 rounded-lg border border-zinc-200/90 bg-white p-1.5 pr-2.5 shadow-xs transition-all hover:border-zinc-300 hover:bg-zinc-50/80 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
            title={`Download ${att.filename} (${formattedSize})`}
          >
            {/* Color-Coded File Type Thumbnail Badge */}
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                fileBadge.badgeBg,
                fileBadge.badgeBorder
              )}
            >
              <Icon className={cn("h-4 w-4", fileBadge.iconColor)} />
            </div>

            {/* File Details */}
            <div className="flex min-w-0 flex-col">
              <span className="max-w-[200px] truncate text-xs font-semibold text-zinc-900 transition-colors group-hover:text-primary dark:text-zinc-100">
                {att.filename || "Attachment"}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                <span>{formattedSize}</span>
                {fileBadge.label && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-600">•</span>
                    <span className="text-[10px] font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-300">
                      {fileBadge.label}
                    </span>
                  </>
                )}
              </span>
            </div>

            {/* Download Action Button Indicator */}
            <div className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors group-hover:bg-zinc-100 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:bg-zinc-800 dark:group-hover:text-zinc-200">
              <Download className="h-3.5 w-3.5" />
            </div>
          </a>
        )
      })}
    </div>
  )
}
