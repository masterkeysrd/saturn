import { useState } from "react"
import { useListMySecurityEventsQuery } from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  LockIcon,
  UnlockIcon,
  RefreshCwIcon,
  ShieldIcon,
  SmartphoneIcon,
  MonitorIcon,
  GlobeIcon,
  ClockIcon,
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { parseUserAgent } from "@/lib/utils"

const PAGE_SIZE = 10

export function SecurityActivityLogSettings() {
  const [pageToken, setPageToken] = useState("")
  const [tokenHistory, setTokenHistory] = useState<string[]>([])

  const {
    data: eventsData,
    isLoading: isLoadingEvents,
    refetch: refetchEvents,
  } = useListMySecurityEventsQuery({
    limit: PAGE_SIZE,
    nextPageToken: pageToken,
  })

  const handleNextPage = () => {
    if (eventsData?.nextPageToken) {
      setTokenHistory((prev) => [...prev, pageToken])
      setPageToken(eventsData.nextPageToken)
    }
  }

  const handlePrevPage = () => {
    if (tokenHistory.length > 0) {
      const prevToken = tokenHistory[tokenHistory.length - 1]
      setTokenHistory((prev) => prev.slice(0, -1))
      setPageToken(prevToken)
    }
  }

  const handleRefresh = () => {
    setPageToken("")
    setTokenHistory([])
    refetchEvents()
  }

  const getEventMeta = (type: string) => {
    switch (type) {
      case "password_change":
        return {
          label: "Password Changed",
          icon: LockIcon,
          colorClass: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        }
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
          icon: AlertTriangleIcon,
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

  const events = eventsData?.events || []

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <ShieldIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">
                Security Activity Log
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Page {tokenHistory.length + 1}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Audit trail of recent logins, password updates, and account
              security events.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isLoadingEvents}
          className="h-8 w-8 cursor-pointer self-start sm:self-center"
        >
          <RefreshCwIcon
            className={`h-3.5 w-3.5 ${isLoadingEvents ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Content */}
      <div>
        {isLoadingEvents ? (
          <div className="flex h-32 items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCwIcon className="h-4 w-4 animate-spin text-primary" />
              Loading security logs...
            </div>
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center p-6 text-center select-none">
            <ShieldCheckIcon className="mb-2 h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              No recent security events
            </p>
            <p className="text-xs text-muted-foreground">
              Your account security history is completely clean.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/30">
              {events.map((ev) => {
                const meta = getEventMeta(ev.eventType || "")
                const parsedDevice = parseUserAgent(ev.userAgent || "")
                const dateStr = ev.createdAt
                  ? new Date(ev.createdAt).toLocaleString()
                  : "Unknown time"

                return (
                  <div
                    key={ev.id}
                    className="flex flex-col gap-3 py-4 transition-colors first:pt-5 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3.5 text-left">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${meta.colorClass}`}
                      >
                        <meta.icon className="h-5 w-5" />
                      </div>

                      <div className="space-y-1">
                        <span className="text-sm font-semibold text-foreground">
                          {meta.label}
                        </span>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            {parsedDevice.isMobile ? (
                              <SmartphoneIcon className="h-3 w-3" />
                            ) : (
                              <MonitorIcon className="h-3 w-3" />
                            )}
                            <span>{parsedDevice.device || "Unknown Device"}</span>
                          </span>

                          {ev.ipAddress && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1">
                                <GlobeIcon className="h-3 w-3" />
                                <span className="font-mono">{ev.ipAddress}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-muted-foreground sm:self-center">
                      <ClockIcon className="h-3 w-3" />
                      <span>{dateStr}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination Controls */}
            {events.length > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-border/30 pt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span>Page {tokenHistory.length + 1}</span>
                  <span>•</span>
                  <span>
                    {events.length} {events.length === 1 ? "event" : "events"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={tokenHistory.length === 0 || isLoadingEvents}
                    className="h-8 cursor-pointer text-xs"
                  >
                    <ChevronLeftIcon className="mr-1 h-3.5 w-3.5" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!eventsData?.nextPageToken || isLoadingEvents}
                    className="h-8 cursor-pointer text-xs"
                  >
                    Next
                    <ChevronRightIcon className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
