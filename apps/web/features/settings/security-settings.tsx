import { useListMySecurityEventsQuery } from "@/gen/saturn/identity/v1/identity"
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  LockIcon,
  UnlockIcon,
  RefreshCwIcon,
  ShieldIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { parseUserAgent } from "@/lib/utils"

export function SecuritySettings() {
  const { data, isLoading, refetch } = useListMySecurityEventsQuery({
    limit: 20,
    nextPageToken: "",
  })

  const getEventMeta = (type: string) => {
    switch (type) {
      case "login_success":
        return {
          label: "Successful Login",
          icon: ShieldCheckIcon,
          colorClass: "text-green-500 bg-green-500/10 border-green-500/20",
        }
      case "login_failed":
        return {
          label: "Failed Login Attempt",
          icon: ShieldAlertIcon,
          colorClass: "text-red-500 bg-red-500/10 border-red-500/20",
        }
      case "account_locked":
        return {
          label: "Account Suspended/Locked",
          icon: LockIcon,
          colorClass: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        }
      case "account_unlocked":
        return {
          label: "Account Unlocked",
          icon: UnlockIcon,
          colorClass: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        }
      default:
        return {
          label: "Security Event",
          icon: ShieldIcon,
          colorClass: "text-muted-foreground bg-muted/10 border-muted/20",
        }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header and Sync */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Security Log & Login History
          </h2>
          <p className="text-sm text-muted-foreground">
            Review recent logins, device metadata, and auth changes linked to
            your account.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isLoading}
          className="h-9 w-9 cursor-pointer"
        >
          <RefreshCwIcon
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-36 items-center justify-center rounded-xl border border-border/50 bg-card/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCwIcon className="h-4 w-4 animate-spin text-primary" />
            Loading security logs...
          </div>
        </div>
      ) : !data?.events || data.events.length === 0 ? (
        <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-border/50 bg-card/60 p-6 text-center select-none">
          <ShieldIcon className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            No recent security events
          </p>
          <p className="text-xs text-muted-foreground">
            Your account security history is completely clean.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/60 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/40 text-xs font-semibold text-muted-foreground select-none">
                  <th className="p-4">Event</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4">Device & Browser</th>
                  <th className="p-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.events.map((ev) => {
                  const meta = getEventMeta(ev.eventType)
                  const parsedDevice = parseUserAgent(ev.userAgent)
                  const dateStr = ev.createdAt
                    ? new Date(ev.createdAt).toLocaleString()
                    : "Unknown time"

                  return (
                    <tr
                      key={ev.id}
                      className="transition-colors duration-150 hover:bg-muted/10"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg border ${meta.colorClass}`}
                          >
                            <meta.icon className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-foreground">
                              {meta.label}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">
                        {ev.ipAddress}
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-muted-foreground">
                          {parsedDevice.device}
                        </span>
                      </td>
                      <td className="p-4 text-right font-mono text-xs text-muted-foreground">
                        {dateStr}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
