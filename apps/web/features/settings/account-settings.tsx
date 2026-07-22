import { useAuth } from "@/features/auth/use-auth"
import {
  UserIcon,
  MailIcon,
  HashIcon,
  BadgeCheckIcon,
  MonitorIcon,
  SmartphoneIcon,
  Trash2Icon,
  LogOutIcon,
  RefreshCwIcon,
} from "lucide-react"
import {
  useListActiveSessionsQuery,
  useRevokeSessionMutation,
  useRevokeAllSessionsMutation,
} from "@/gen/saturn/identity/v1/identity"
import { parseUserAgent } from "@/lib/utils"

export function AccountSettings() {
  const { user } = useAuth()

  const {
    data: sessionsData,
    isLoading,
    refetch,
  } = useListActiveSessionsQuery({})
  const revokeSessionMutation = useRevokeSessionMutation({
    onSuccess: () => refetch(),
  })
  const revokeAllSessionsMutation = useRevokeAllSessionsMutation({
    onSuccess: () => {
      window.dispatchEvent(new Event("auth:unauthorized"))
    },
  })

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
      <div className="space-y-3">
        <h3 className="text-left text-sm font-semibold text-foreground">
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

      {/* Active Sessions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-left text-sm font-semibold text-foreground">
            Active Sessions
          </h3>
          {sessionsData &&
            sessionsData.sessions &&
            sessionsData.sessions.length > 1 && (
              <button
                onClick={() => {
                  if (
                    confirm(
                      "Are you sure you want to log out of all devices? This will also log you out of this device."
                    )
                  ) {
                    revokeAllSessionsMutation.mutate({})
                  }
                }}
                disabled={revokeAllSessionsMutation.isPending}
                className="hover:text-red-650 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-red-500 transition-colors disabled:opacity-50"
              >
                <LogOutIcon className="h-3.5 w-3.5" />
                Sign Out of All Devices
              </button>
            )}
        </div>

        <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/40 bg-muted/10">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <RefreshCwIcon className="h-4 w-4 animate-spin" />
              Loading sessions...
            </div>
          ) : !sessionsData?.sessions || sessionsData.sessions.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No active sessions found.
            </div>
          ) : (
            sessionsData.sessions.map((session) => {
              const formattedDate = session.lastUsedAt
                ? new Date(session.lastUsedAt).toLocaleString()
                : "Unknown"
              const { device, isMobile } = parseUserAgent(session.userAgent)

              return (
                <div
                  key={session.sessionId}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-muted/10"
                >
                  <div className="flex items-center gap-3.5 text-left">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/30 bg-muted/40 text-muted-foreground">
                      {isMobile ? (
                        <SmartphoneIcon className="h-5 w-5" />
                      ) : (
                        <MonitorIcon className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span
                        className="max-w-xs truncate text-sm font-semibold text-foreground md:max-w-md"
                        title={session.userAgent}
                      >
                        {device}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>IP: {session.ipAddress || "Unknown"}</span>
                        <span className="text-border/85">•</span>
                        <span>Last active: {formattedDate}</span>
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (
                        confirm("Are you sure you want to revoke this session?")
                      ) {
                        revokeSessionMutation.mutate({
                          session_id: session.sessionId,
                          req: { sessionId: session.sessionId },
                        })
                      }
                    }}
                    disabled={revokeSessionMutation.isPending}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                    title="Revoke session"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
