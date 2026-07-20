import { useAuth } from "@/features/auth/use-auth"
import { UserIcon, MailIcon, HashIcon, BadgeCheckIcon } from "lucide-react"

export function AccountSettings() {
  const { user } = useAuth()

  const initials = (user?.name || user?.username || "U")
    .substring(0, 2)
    .toUpperCase()

  return (
    <div className="space-y-6">
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
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Profile Details
        </h3>
        <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/40 bg-muted/20 select-none">
          <div className="flex items-center gap-3.5 p-4 transition-colors hover:bg-muted/10">
            <UserIcon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                Full Name
              </span>
              <span className="mt-1.5 text-sm font-medium text-foreground">
                {user?.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 p-4 transition-colors hover:bg-muted/10">
            <MailIcon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                Email Address
              </span>
              <span className="mt-1.5 text-sm font-medium text-foreground">
                {user?.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5 p-4 transition-colors hover:bg-muted/10">
            <HashIcon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col overflow-hidden text-left">
              <span className="text-[10px] leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                User Identifier
              </span>
              <span className="mt-1.5 max-w-xs truncate font-mono text-xs text-foreground/80">
                {user?.id}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
