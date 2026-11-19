import { useMemo } from "react"
import {
  Inbox,
  Star,
  Send,
  FileEdit,
  Archive,
  AlertOctagon,
  Trash2,
  Folder,
  Plus,
  Layers,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useMailboxes,
  useConnectedAccounts,
  useI18n,
  type ConnectedAccount,
} from "@saturn/hooks"
import { isMailAccountReauthRequired } from "@saturn/core"
import type { MailboxRole, Mailbox } from "@saturn/api/saturn/mail/v1/mail"
import type { TranslationKey } from "@saturn/i18n"
import { cn } from "@/lib/utils"

export interface MailboxRailProps {
  selectedRole?: MailboxRole
  selectedAccountId?: string
  selectedMailboxId?: string
  onSelectRole: (role: MailboxRole) => void
  onSelectAccount: (accountId?: string) => void
  onSelectMailbox: (mailboxId: string) => void
  onOpenCompose: () => void
  onReconnectAccount?: (account: ConnectedAccount) => void
  isReconnecting?: boolean
}

interface BucketItem {
  role: MailboxRole
  translationKey: TranslationKey
  icon: typeof Inbox
}

const SYSTEM_BUCKETS: BucketItem[] = [
  {
    role: "MAILBOX_ROLE_INBOX",
    translationKey: "mail.bucket.inbox",
    icon: Inbox,
  },
  {
    role: "MAILBOX_ROLE_STARRED",
    translationKey: "mail.bucket.starred",
    icon: Star,
  },
  { role: "MAILBOX_ROLE_SENT", translationKey: "mail.bucket.sent", icon: Send },
  {
    role: "MAILBOX_ROLE_DRAFTS",
    translationKey: "mail.bucket.drafts",
    icon: FileEdit,
  },
  {
    role: "MAILBOX_ROLE_ARCHIVE",
    translationKey: "mail.bucket.archive",
    icon: Archive,
  },
  {
    role: "MAILBOX_ROLE_SPAM",
    translationKey: "mail.bucket.spam",
    icon: AlertOctagon,
  },
  {
    role: "MAILBOX_ROLE_TRASH",
    translationKey: "mail.bucket.trash",
    icon: Trash2,
  },
]

export function MailboxRail({
  selectedRole = "MAILBOX_ROLE_INBOX",
  selectedAccountId,
  selectedMailboxId,
  onSelectRole,
  onSelectAccount,
  onSelectMailbox,
  onOpenCompose,
  onReconnectAccount,
  isReconnecting = false,
}: MailboxRailProps) {
  const { t } = useI18n()
  const { data: mailboxesData } = useMailboxes(selectedAccountId)
  const { data: accountsData } = useConnectedAccounts()

  const mailboxes = useMemo(
    () => mailboxesData?.mailboxes || [],
    [mailboxesData]
  )
  const accounts = useMemo(() => {
    return (accountsData?.accounts || []).filter(
      (a) =>
        a.enabledCapabilities?.includes("mail") ||
        a.enabledCapabilities?.includes("MAIL")
    )
  }, [accountsData])

  // Aggregate unread counts per system role
  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const mbx of mailboxes) {
      const role = mbx.systemRole
      counts[role] = (counts[role] || 0) + (mbx.unreadCount || 0)
    }
    return counts
  }, [mailboxes])

  // Custom user-defined mailboxes/labels
  const customMailboxes = useMemo(() => {
    return mailboxes.filter((m) => m.systemRole === "MAILBOX_ROLE_CUSTOM")
  }, [mailboxes])

  return (
    <div
      data-testid="mailbox-rail"
      className="flex h-full w-56 shrink-0 flex-col border-r border-border/40 bg-card p-3 select-none"
    >
      {/* Compose Button */}
      <Button
        data-testid="compose-btn"
        onClick={onOpenCompose}
        className="w-full gap-2 shadow-xs"
        size="sm"
      >
        <Plus className="h-4 w-4" />
        <span>{t("mail.compose")}</span>
      </Button>

      {/* System Buckets */}
      <div className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto">
        <div className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {t("mail.mailboxes")}
        </div>
        {SYSTEM_BUCKETS.map((bucket) => {
          const Icon = bucket.icon
          const isSelected = !selectedMailboxId && selectedRole === bucket.role
          const count = unreadCounts[bucket.role] || 0

          return (
            <button
              key={bucket.role}
              type="button"
              data-testid={`bucket-${bucket.role.toLowerCase()}`}
              onClick={() => onSelectRole(bucket.role)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                isSelected
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="truncate">{t(bucket.translationKey)}</span>
              </div>
              {count > 0 && (
                <span
                  data-testid={`unread-count-${bucket.role.toLowerCase()}`}
                  className={cn(
                    "py-0.2 rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground/80"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}

        {/* Custom Labels / Folders (if any) */}
        {customMailboxes.length > 0 && (
          <div className="mt-4">
            <div className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t("mail.folders")}
            </div>
            {customMailboxes.map((mbx: Mailbox) => {
              const isSelected = selectedMailboxId === mbx.id
              return (
                <button
                  key={mbx.id}
                  type="button"
                  data-testid={`custom-mailbox-${mbx.id}`}
                  onClick={() => onSelectMailbox(mbx.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                    isSelected
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Folder
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span className="truncate">{mbx.name}</span>
                  </div>
                  {mbx.unreadCount > 0 && (
                    <span className="py-0.2 rounded-full bg-muted px-1.5 text-[10px] font-bold text-foreground/80 tabular-nums">
                      {mbx.unreadCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Accounts Filter */}
        <div className="mt-4 border-t border-border/40 pt-3">
          <div className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t("mail.accounts")}
          </div>
          <button
            type="button"
            data-testid="account-filter-all"
            onClick={() => onSelectAccount(undefined)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
              !selectedAccountId
                ? "bg-primary/10 font-semibold text-primary"
                : "text-foreground/80 hover:bg-muted hover:text-foreground"
            )}
          >
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t("mail.allAccounts")}</span>
          </button>

          {accounts.map((acc) => {
            const isSelected = selectedAccountId === acc.id
            const needsReauth = isMailAccountReauthRequired(acc)
            return (
              <div
                key={acc.id}
                className={cn(
                  "flex w-full items-center gap-1 rounded-lg transition",
                  isSelected
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground/80 hover:bg-muted hover:text-foreground"
                )}
              >
                <button
                  type="button"
                  data-testid={`account-filter-${acc.id}`}
                  onClick={() => onSelectAccount(acc.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left text-xs font-medium"
                >
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: acc.color || "#3b82f6" }}
                  />
                  <span className="truncate">
                    {acc.displayName || acc.email}
                  </span>
                </button>
                {needsReauth && (
                  <button
                    type="button"
                    data-testid={`account-reauth-warning-${acc.id}`}
                    disabled={isReconnecting}
                    onClick={(e) => {
                      e.stopPropagation()
                      onReconnectAccount?.(acc)
                    }}
                    title={`${t("mail.reauth.bannerTitle")} — ${t("mail.reauth.reconnect")}`}
                    aria-label={`${t("mail.reauth.bannerTitle")} (${acc.email || acc.displayName || acc.id})`}
                    className="mr-1.5 flex shrink-0 items-center rounded p-1 text-amber-500 transition hover:bg-amber-500/15 disabled:opacity-50"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
