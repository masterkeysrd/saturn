import { useState } from "react"
import {
  useListSecurityEventsQuery,
  type SecurityEvent,
} from "@/gen/saturn/identity/admin/v1/admin_identity"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination"
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  LockIcon,
  UnlockIcon,
  RefreshCwIcon,
  ShieldIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { parseUserAgent } from "@/lib/utils"
import { PageLayout } from "@/components/ui/page-layout"

export function AdminSecurityView() {
  const [emailFilter, setEmailFilter] = useState("")
  const [eventTypeFilter, setEventTypeFilter] = useState("")
  const [pageToken, setPageToken] = useState("")
  const [tokenHistory, setTokenHistory] = useState<string[]>([])

  const handleEmailSearch = (val: string) => {
    setEmailFilter(val)
    setPageToken("")
    setTokenHistory([])
  }

  const handleEventTypeFilter = (val: string) => {
    setEventTypeFilter(val)
    setPageToken("")
    setTokenHistory([])
  }

  const handleNextPage = () => {
    if (data?.nextPageToken) {
      setTokenHistory((prev) => [...prev, pageToken])
      setPageToken(data.nextPageToken)
    }
  }

  const handlePrevPage = () => {
    if (tokenHistory.length > 0) {
      const prevToken = tokenHistory[tokenHistory.length - 1]
      setTokenHistory((prev) => prev.slice(0, -1))
      setPageToken(prevToken)
    }
  }

  // Fetch security audit logs with cursor pagination
  const { data, isLoading, isError, refetch } = useListSecurityEventsQuery({
    email: emailFilter,
    eventType: eventTypeFilter,
    limit: 10,
    nextPageToken: pageToken,
  })

  const getEventMeta = (type: string) => {
    switch (type) {
      case "login_success":
        return {
          label: "Login Success",
          icon: ShieldCheckIcon,
          colorClass:
            "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
        }
      case "login_failed":
        return {
          label: "Login Failure",
          icon: ShieldAlertIcon,
          colorClass:
            "text-destructive bg-destructive/10 border-destructive/20",
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
      className="cursor-pointer gap-2"
    >
      <RefreshCwIcon className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
      Refresh
    </Button>
  )

  return (
    <TooltipProvider>
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
              onChange={(e) => handleEmailSearch(e.target.value)}
              className="w-full rounded-2xl border border-border/60 bg-input/20 py-2 pr-4 pl-10 text-xs text-foreground placeholder-muted-foreground/60 transition-all outline-none focus:border-primary/80 focus:ring-4 focus:ring-primary/15 dark:bg-input/10"
            />
          </div>

          {/* Event Type Filter buttons */}
          <div className="flex w-fit items-center gap-1.5 rounded-2xl border border-border/50 bg-muted/20 p-1">
            <button
              onClick={() => handleEventTypeFilter("")}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                eventTypeFilter === ""
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Events
            </button>
            <button
              onClick={() => handleEventTypeFilter("login_failed")}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                eventTypeFilter === "login_failed"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Failures Only
            </button>
            <button
              onClick={() => handleEventTypeFilter("account_locked")}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                eventTypeFilter === "account_locked"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Lockouts Only
            </button>
          </div>
        </div>

        {/* Audit Log Card Table */}
        <Card size="sm" className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase select-none">
                    <th className="w-40 py-3 pr-4 pl-6">Event</th>
                    <th className="w-48 px-4 py-3">User Email</th>
                    <th className="w-32 px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">Device & Browser</th>
                    <th className="w-56 py-3 pr-6 pl-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="py-3 pr-4 pl-6">
                          <Skeleton className="h-5 w-28" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-36" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                        <td className="py-3 pr-6 pl-4 text-right">
                          <Skeleton className="ml-auto h-4 w-36" />
                        </td>
                      </tr>
                    ))
                  ) : isError ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-destructive"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <ShieldAlertIcon className="h-8 w-8" />
                          <span className="text-sm font-semibold">
                            Failed to load security logs
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Check API gateway connectivity.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : !data?.events || data.events.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-muted-foreground select-none"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <ShieldIcon className="h-8 w-8 text-muted-foreground/40" />
                          <span className="text-sm font-semibold text-foreground">
                            No security logs found
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Try clearing your filters or refreshing the log.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    data.events.map((ev: SecurityEvent) => {
                      const meta = getEventMeta(ev.eventType)
                      const parsedDevice = parseUserAgent(ev.userAgent)
                      const dateStr = ev.createdAt
                        ? new Date(ev.createdAt).toLocaleString()
                        : "Unknown"

                      return (
                        <tr
                          key={ev.id}
                          className="transition-colors duration-150 hover:bg-muted/10"
                        >
                          <td className="overflow-hidden py-3 pr-4 pl-6">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${meta.colorClass}`}
                              >
                                <meta.icon className="h-3.5 w-3.5" />
                              </div>
                              <span className="truncate text-xs font-semibold text-foreground">
                                {meta.label}
                              </span>
                            </div>
                          </td>
                          <td className="overflow-hidden px-4 py-3 font-medium text-foreground">
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="block truncate">
                                  {ev.email}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{ev.email}</TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
                            {ev.ipAddress}
                          </td>
                          <td className="overflow-hidden px-4 py-3">
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {parsedDevice.device}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs break-all">
                                {ev.userAgent || parsedDevice.device}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="py-3 pr-6 pl-4 text-right font-mono text-xs whitespace-nowrap text-muted-foreground">
                            {dateStr}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Shared Pagination Controls */}
            <div className="flex items-center justify-between border-t border-border/40 bg-muted/10 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Page {tokenHistory.length + 1}</span>
                {data?.events && (
                  <span className="rounded border border-border/40 bg-muted/50 px-2 py-0.5 font-mono text-[11px]">
                    {data.events.length} events
                  </span>
                )}
              </div>

              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={tokenHistory.length === 0}
                      className="h-8 gap-1 text-xs"
                    >
                      <ChevronLeftIcon className="h-3.5 w-3.5" />
                      Previous
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={!data?.nextPageToken}
                      className="h-8 gap-1 text-xs"
                    >
                      Next
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </CardContent>
        </Card>
      </PageLayout>
    </TooltipProvider>
  )
}
