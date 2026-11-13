import { useState, useMemo } from "react"
import { Check, Copy, ExternalLink, Mail, ShieldCheck } from "lucide-react"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

export interface SenderAvatarProps {
  email?: string
  name?: string
  avatarUrl?: string
  isVerified?: boolean
  size?: "sm" | "md" | "lg"
  className?: string
  showPopover?: boolean
  onQuickReply?: () => void
}

const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "gmx.com",
  "mail.com",
])

const PALETTES = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200 border-indigo-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200 border-emerald-200",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-200 border-violet-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border-amber-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200 border-rose-200",
  "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200 border-sky-200",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-200 border-teal-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200 border-orange-200",
]

function getPalette(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  const idx = Math.abs(hash) % PALETTES.length
  return PALETTES[idx]
}

export function SenderAvatar({
  email = "",
  name = "",
  avatarUrl,
  isVerified,
  size = "md",
  className = "",
  showPopover = true,
  onQuickReply,
}: SenderAvatarProps) {
  const [open, setOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [copied, setCopied] = useState(false)

  // Extract domain
  const domain = useMemo(() => {
    if (!email || !email.includes("@")) return ""
    const parts = email.split("@")
    return parts[parts.length - 1].toLowerCase().trim()
  }, [email])

  const isCompanyDomain = Boolean(
    domain && !PUBLIC_DOMAINS.has(domain) && domain.includes(".")
  )

  // Prefer backend-resolved avatar URL (BIMI or domain logo), with fallback to Google Favicons
  const logoUrl = useMemo(() => {
    if (avatarUrl) return avatarUrl
    if (!isCompanyDomain) return null
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
  }, [avatarUrl, domain, isCompanyDomain])

  const isVerifiedSender = Boolean(isVerified)

  // Extract initials
  const initials = useMemo(() => {
    const cleanName = (name || "").trim()
    if (cleanName) {
      const words = cleanName.split(/\s+/).filter(Boolean)
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase()
      }
      return cleanName.slice(0, 2).toUpperCase()
    }
    if (email) {
      return email.charAt(0).toUpperCase()
    }
    return "U"
  }, [name, email])

  const paletteClass = useMemo(() => {
    return getPalette(name || email || "default")
  }, [name, email])

  const sizeClass = {
    sm: "h-7 w-7 text-[11px]",
    md: "h-8 w-8 text-xs",
    lg: "h-10 w-10 text-sm",
  }[size]

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!email) return
    navigator.clipboard.writeText(email)
    setCopied(true)
    toast.add({ title: "Email copied to clipboard", type: "success" })
    setTimeout(() => setCopied(false), 2000)
  }

  const avatarElement = (
    <div
      data-testid="sender-avatar"
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full font-bold transition-transform select-none hover:scale-105",
        sizeClass,
        logoUrl && !imgError
          ? "border border-border/80 bg-background p-0.5 shadow-xs"
          : cn("border", paletteClass),
        className
      )}
    >
      {logoUrl && !imgError ? (
        <img
          src={logoUrl}
          alt={name || domain}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full rounded-full object-contain"
        />
      ) : (
        <span>{initials}</span>
      )}

      {/* Verified checkmark badge for major company senders */}
      {isVerifiedSender && (
        <span
          className="absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[8px] text-white ring-1 ring-background"
          title={`Verified organization: ${domain}`}
        >
          <Check className="h-2 w-2 stroke-[3]" />
        </span>
      )}
    </div>
  )

  if (!showPopover) {
    return avatarElement
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={(e) => e.stopPropagation()}
        className="cursor-pointer rounded-full focus:ring-2 focus:ring-primary/40 focus:outline-none"
        aria-label={`Sender info for ${name || email}`}
      >
        {avatarElement}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 rounded-xl border border-border/80 bg-popover p-4 text-popover-foreground shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold select-none",
              logoUrl && !imgError
                ? "border border-border/80 bg-background p-1 shadow-xs"
                : cn("border text-sm", paletteClass)
            )}
          >
            {logoUrl && !imgError ? (
              <img
                src={logoUrl}
                alt={name || domain}
                referrerPolicy="no-referrer"
                className="h-full w-full rounded-full object-contain"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {name || email.split("@")[0]}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {email}
            </span>

            {isVerifiedSender && (
              <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-3 w-3" />
                <span className="truncate">Verified from {domain}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyEmail}
            className="h-7 flex-1 gap-1 border-border/60 bg-background text-xs font-medium text-foreground hover:bg-muted"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy email</span>
              </>
            )}
          </Button>

          {onQuickReply && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setOpen(false)
                onQuickReply()
              }}
              className="h-7 gap-1 px-3 text-xs font-medium"
            >
              <Mail className="h-3 w-3" />
              <span>Reply</span>
            </Button>
          )}

          {isCompanyDomain && (
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              title={`Visit ${domain}`}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
