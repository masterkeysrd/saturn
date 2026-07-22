import { useState } from "react"
import { useListSecurityEventsQuery } from "@/gen/saturn/identity/admin/v1/admin_identity"
import { Button } from "@/components/ui/button"
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  LockIcon,
  UnlockIcon,
  RefreshCwIcon,
  ShieldIcon,
  SearchIcon,
} from "lucide-react"
import { parseUserAgent } from "@/lib/utils"
import { PageLayout } from "@/components/ui/page-layout"

export function AdminSecurityView() {
  const [emailFilter, setEmailFilter] = useState("")
  const [eventTypeFilter, setEventTypeFilter] = useState("")

  // Fetch security audit logs
  const { data, isLoading, isError, refetch } = useListSecurityEventsQuery({
    email: emailFilter,
    eventType: eventTypeFilter,
    limit: 100,
    nextPageToken: "",
  })

  const getEventMeta = (type: string) => {
    switch (type) {
      case "login_success":
        return {
          label: "Login Success",
          icon: ShieldCheckIcon,
          colorClass: "text-green-500 bg-green-500/10 border-green-500/20",
        }
      case "login_failed":
        return {
          label: "Login Failure",
          icon: ShieldAlertIcon,
          colorClass: "text-red-500 bg-red-500/10 border-red-500/20",
        }
      case "account_locked":
        return {
          label: "Account Locked",
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

  const refreshButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => refetch()}
      disabled={isLoading}
      className="cursor-pointer self-start rounded-xl"
    >
      <RefreshCwIcon
        className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
      />
      Refresh
    </Button>
  )

  return (
    <PageLayout
      title="Security & Login Audits"
      description="Monitor real-time workspace access attempts, failed logins, and system lockouts."
      icon={ShieldIcon}
      actions={refreshButton}
    >
      {/* Filters and Search toolbar */}
      <div className="flex flex-col gap-4 select-none sm:flex-row sm:items-center">
        {/* Email Search input */}
        <div className="relative max-w-sm flex-1">
          <div className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">
            <SearchIcon className="h-4 w-4" />
          </div>
          <input
            type="text"
            placeholder="Search by user email..."
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            className="w-full rounded-2xl border border-border/60 bg-input/20 py-2.5 pr-4 pl-10 text-sm text-foreground placeholder-muted-foreground/60 transition-all outline-none focus:border-primary/80 focus:ring-4 focus:ring-primary/15 dark:bg-input/10"
          />
        </div>

        {/* Event Type Filter buttons */}
        <div className="flex w-fit items-center gap-1.5 rounded-2xl border border-border/50 bg-muted/20 p-1">
          <button
            onClick={() => setEventTypeFilter("")}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              eventTypeFilter === ""
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Events
          </button>
          <button
            onClick={() => setEventTypeFilter("login_failed")}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              eventTypeFilter === "login_failed"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Failures Only
          </button>
          <button
            onClick={() => setEventTypeFilter("account_locked")}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              eventTypeFilter === "account_locked"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Lockouts Only
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/45 shadow-xl backdrop-blur-xl">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-20">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-12 w-12 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary duration-1000" />
              <div className="h-4 w-4 animate-pulse rounded-full bg-gradient-to-tr from-primary to-accent" />
            </div>
            <span className="text-sm text-muted-foreground">
              Loading security logs...
            </span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center space-y-2 py-16 text-red-500">
            <ShieldAlertIcon className="h-10 w-10 animate-bounce" />
            <span className="text-sm font-semibold">
              Failed to load security logs
            </span>
            <span className="text-xs text-muted-foreground">
              Check API gateway connectivity.
            </span>
          </div>
        ) : !data?.events || data.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-2 py-20 text-center select-none">
            <ShieldIcon className="h-12 w-12 text-muted-foreground/40" />
            <span className="text-sm font-semibold text-foreground">
              No security logs found
            </span>
            <span className="text-xs text-muted-foreground">
              Try clearing your filters or refreshing the log.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20 text-xs font-semibold text-muted-foreground select-none">
                  <th className="p-4">Event</th>
                  <th className="p-4">User Email</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4">Device & Browser</th>
                  <th className="p-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {data.events.map((ev) => {
                  const meta = getEventMeta(ev.eventType)
                  const parsedDevice = parseUserAgent(ev.userAgent)
                  const dateStr = ev.createdAt
                    ? new Date(ev.createdAt).toLocaleString()
                    : "Unknown"

                  return (
                    <tr
                      key={ev.id}
                      className="transition-colors duration-150 hover:bg-muted/5"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg border ${meta.colorClass}`}
                          >
                            <meta.icon className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-semibold text-foreground">
                            {meta.label}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 font-medium text-foreground">
                        {ev.email}
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
        )}
      </div>
    </PageLayout>
  )
}
