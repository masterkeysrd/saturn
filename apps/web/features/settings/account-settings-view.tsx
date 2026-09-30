import { Link } from "react-router-dom"
import { useAuth } from "@/features/auth/use-auth"
import {
  UserIcon,
  MailIcon,
  HashIcon,
  BadgeCheckIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export function AccountSettingsView() {
  const { user } = useAuth()

  const initials = (user?.name || user?.username || "U")
    .substring(0, 2)
    .toUpperCase()

  return (
    <div className="space-y-8">
      {/* Profile Overview Banner */}
      <div className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm select-none dark:bg-card/45">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-accent text-2xl font-bold text-white shadow-lg shadow-primary/20">
            {initials}
          </div>
          <div className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded bg-green-500 text-white shadow-md">
            <BadgeCheckIcon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="flex flex-col text-left">
          <h2 className="text-lg font-bold text-foreground">{user?.name}</h2>
          <p className="text-xs text-muted-foreground">
            @{user?.username || "username"}
          </p>
        </div>
      </div>

      {/* Account Details List */}
      <div className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs select-none">
        <h3 className="text-left text-base font-semibold text-foreground">
          Profile Details
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personal information and account identity details.
        </p>
        <div className="mt-5 divide-y divide-border/30 border-t border-border/40">
          <div className="flex items-center gap-3.5 py-4 transition-colors first:pt-4 last:pb-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground">
              <UserIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                Full Name
              </span>
              <span className="mt-1 text-sm font-medium text-foreground">
                {user?.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 py-4 transition-colors first:pt-4 last:pb-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground">
              <MailIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                Email Address
              </span>
              <span className="mt-1 text-sm font-medium text-foreground">
                {user?.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 py-4 transition-colors first:pt-4 last:pb-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground">
              <HashIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col overflow-hidden text-left">
              <span className="text-[10px] leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                User Identifier
              </span>
              <span className="mt-1 max-w-xs truncate font-mono text-xs text-foreground/80">
                {user?.id}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Logins Shortcut */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/60 p-5 shadow-xs select-none sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <ShieldCheckIcon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              Security, Credentials & Logins
            </h4>
            <p className="text-xs text-muted-foreground">
              Manage your active sign-in sessions, master password, 2FA
              authenticator apps, and trusted devices.
            </p>
          </div>
        </div>
        <Link to="/settings/security" className="shrink-0">
          <Button variant="outline" size="sm" className="cursor-pointer">
            Manage Security & Logins
            <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
