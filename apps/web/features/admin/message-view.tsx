import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useGetQueueMetricsQuery,
  useListDeliveriesQuery,
  useRetryDeliveryMutation,
  type DeliveryInfo,
} from "@/gen/saturn/platform/message/v1/admin"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination"
import {
  RefreshCwIcon,
  RotateCwIcon,
  AlertOctagonIcon,
  CheckCircle2Icon,
  ClockIcon,
  ActivityIcon,
  LayersIcon,
  ListFilterIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react"
import { PageLayout } from "@/components/ui/page-layout"
import { formatRelativeTime } from "@/lib/utils"

export function MessageQueueAdminView() {
  const queryClient = useQueryClient()
  const [selectedTopic, setSelectedTopic] = useState<string>("")
  const [selectedStatus, setSelectedStatus] = useState<string>("")
  const [pageToken, setPageToken] = useState<string>("")
  const [tokenHistory, setTokenHistory] = useState<string[]>([])
  const [now] = useState(() => Date.now())
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryInfo | null>(
    null
  )
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Reset pagination when filters change
  const handleTopicChange = (val: string) => {
    setSelectedTopic(val === "ALL" ? "" : val)
    setPageToken("")
    setTokenHistory([])
  }

  const handleStatusChange = (val: string) => {
    setSelectedStatus(val === "ALL" ? "" : val)
    setPageToken("")
    setTokenHistory([])
  }

  const handleNextPage = () => {
    if (deliveriesData?.nextPageToken) {
      setTokenHistory((prev) => [...prev, pageToken])
      setPageToken(deliveriesData.nextPageToken)
    }
  }

  const handlePrevPage = () => {
    if (tokenHistory.length > 0) {
      const prevToken = tokenHistory[tokenHistory.length - 1]
      setTokenHistory((prev) => prev.slice(0, -1))
      setPageToken(prevToken)
    }
  }

  // Fetch metrics
  const {
    data: metrics,
    isLoading: isMetricsLoading,
    refetch: refetchMetrics,
  } = useGetQueueMetricsQuery({}, { refetchInterval: 5000 })

  // Fetch deliveries
  const {
    data: deliveriesData,
    isLoading: isDeliveriesLoading,
    refetch: refetchDeliveries,
  } = useListDeliveriesQuery(
    {
      topic: selectedTopic,
      status: selectedStatus,
      subscriberId: "",
      pageSize: 20,
      pageToken: pageToken,
    },
    { refetchInterval: 5000 }
  )

  const retryMutation = useRetryDeliveryMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/messages/metrics"],
      })
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/messages/deliveries"],
      })
    },
  })

  const handleRefresh = () => {
    refetchMetrics()
    refetchDeliveries()
  }

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="h-3.5 w-3.5" />
            Completed
          </span>
        )
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
            <RefreshCwIcon className="h-3.5 w-3.5 animate-spin" />
            Processing
          </span>
        )
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <ClockIcon className="h-3.5 w-3.5" />
            Pending
          </span>
        )
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
            <AlertOctagonIcon className="h-3.5 w-3.5" />
            Failed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {status}
          </span>
        )
    }
  }

  return (
    <TooltipProvider>
      <PageLayout
        title="Event Bus & Message Queue"
        description="Monitor asynchronous event delivery queues, topic metrics, and retry stuck messages."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="gap-2"
          >
            <RefreshCwIcon
              className={`h-4 w-4 ${isMetricsLoading || isDeliveriesLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      >
        <div className="space-y-6">
          {/* Metric Cards using shared Card UI */}
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {isMetricsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} size="sm" className="py-0">
                  <CardContent className="p-3.5">
                    <Skeleton className="mb-2 h-3.5 w-20" />
                    <Skeleton className="h-6 w-12" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card size="sm" className="py-0">
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Total Deliveries
                      </span>
                      <LayersIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-1.5 text-2xl font-bold">
                      {metrics?.totalDeliveries ?? "0"}
                    </div>
                  </CardContent>
                </Card>

                <Card size="sm" className="py-0">
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Pending
                      </span>
                      <ClockIcon className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="mt-1.5 text-2xl font-bold text-amber-500">
                      {metrics?.totalPending ?? "0"}
                    </div>
                  </CardContent>
                </Card>

                <Card size="sm" className="py-0">
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Processing
                      </span>
                      <ActivityIcon className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="mt-1.5 text-2xl font-bold text-blue-500">
                      {metrics?.totalProcessing ?? "0"}
                    </div>
                  </CardContent>
                </Card>

                <Card size="sm" className="py-0">
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Completed
                      </span>
                      <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="mt-1.5 text-2xl font-bold text-emerald-500">
                      {metrics?.totalCompleted ?? "0"}
                    </div>
                  </CardContent>
                </Card>

                <Card size="sm" className="py-0">
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Failed
                      </span>
                      <AlertOctagonIcon className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="mt-1.5 text-2xl font-bold text-destructive">
                      {metrics?.totalFailed ?? "0"}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Per-Topic Metrics Breakdown using Card UI */}
          {metrics?.topics && metrics.topics.length > 0 && (
            <Card size="sm" className="py-0">
              <CardContent className="p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ListFilterIcon className="h-4 w-4 text-primary" />
                  Queue Breakdown by Topic
                </h3>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {metrics.topics.map((t) => {
                    const isSelected = selectedTopic === t.topic
                    return (
                      <div
                        key={t.topic}
                        onClick={() =>
                          handleTopicChange(isSelected ? "" : t.topic)
                        }
                        className={`group cursor-pointer rounded-lg border p-2.5 transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 shadow-xs"
                            : "border-border/50 bg-background/50 hover:border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono text-xs font-semibold text-foreground">
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="block max-w-[180px] truncate">
                                {t.topic}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{t.topic}</TooltipContent>
                          </Tooltip>
                          <ChevronRightIcon
                            className={`h-3.5 w-3.5 transition-transform ${isSelected ? "translate-x-0.5 text-primary" : "text-muted-foreground"}`}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Total: {t.total}</span>
                          <div className="flex items-center gap-2">
                            {parseInt(t.pending) > 0 && (
                              <span className="font-medium text-amber-500">
                                {t.pending} pend
                              </span>
                            )}
                            {parseInt(t.processing) > 0 && (
                              <span className="font-medium text-blue-500">
                                {t.processing} proc
                              </span>
                            )}
                            {parseInt(t.failed) > 0 && (
                              <span className="font-medium text-destructive">
                                {t.failed} fail
                              </span>
                            )}
                            {parseInt(t.completed) > 0 && (
                              <span className="font-medium text-emerald-500">
                                {t.completed} ok
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deliveries List Card */}
          <Card size="sm" className="py-0">
            <CardContent className="p-0">
              <div className="flex flex-col items-start justify-between gap-4 border-b border-border/40 p-5 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Message Deliveries
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedTopic
                      ? `Filtered by topic: ${selectedTopic}`
                      : "Showing all delivery events"}
                  </p>
                </div>

                <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                  {/* Topic Select */}
                  <Select
                    value={selectedTopic}
                    onValueChange={(val) =>
                      val !== null && handleTopicChange(val)
                    }
                  >
                    <SelectTrigger className="h-9 w-[180px] text-xs">
                      <SelectValue placeholder="All Topics" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Topics</SelectItem>
                      {metrics?.topics?.map((t) => (
                        <SelectItem key={t.topic} value={t.topic}>
                          {t.topic}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Status Select */}
                  <Select
                    value={selectedStatus}
                    onValueChange={(val) =>
                      val !== null && handleStatusChange(val)
                    }
                  >
                    <SelectTrigger className="h-9 w-[140px] text-xs">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-left text-xs">
                  <thead className="border-b border-border/40 bg-muted/40 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <tr>
                      <th className="w-40 px-4 py-3">Delivery ID</th>
                      <th className="w-48 px-4 py-3">Topic / Subscriber</th>
                      <th className="w-28 px-4 py-3">Status</th>
                      <th className="w-20 px-4 py-3">Attempts</th>
                      <th className="px-4 py-3">Last Error</th>
                      <th className="w-32 px-4 py-3">Created</th>
                      <th className="w-28 px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {isDeliveriesLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3">
                            <Skeleton className="h-4 w-28" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="mb-1 h-4 w-36" />
                            <Skeleton className="h-3 w-24" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="h-5 w-20" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="h-4 w-12" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="h-4 w-full" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="h-4 w-20" />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Skeleton className="ml-auto h-7 w-16" />
                          </td>
                        </tr>
                      ))
                    ) : deliveriesData?.deliveries &&
                      deliveriesData.deliveries.length > 0 ? (
                      deliveriesData.deliveries.map((item: DeliveryInfo) => (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedDelivery(item)}
                          className="cursor-pointer transition-colors hover:bg-muted/20"
                        >
                          <td className="overflow-hidden px-4 py-3 font-mono text-xs font-medium text-foreground">
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="block truncate">
                                  {item.id}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{item.id}</TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="overflow-hidden px-4 py-3">
                            <Tooltip>
                              <TooltipTrigger>
                                <div className="truncate font-mono text-xs font-semibold text-foreground">
                                  {item.topic}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>{item.topic}</TooltipContent>
                            </Tooltip>
                            <div className="truncate font-mono text-[11px] text-muted-foreground">
                              {item.subscriberId}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(item.status)}
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {item.attempts} / {item.maxAttempts}
                          </td>
                          <td className="overflow-hidden px-4 py-3">
                            {item.lastError ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="truncate rounded border border-destructive/10 bg-destructive/5 px-2 py-0.5 font-mono text-[11px] text-destructive">
                                    {item.lastError}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-md break-all">
                                  {item.lastError}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground/50">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            {formatRelativeTime(item.createTime, now)}
                          </td>
                          <td
                            className="px-4 py-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setSelectedDelivery(item)}
                                title="View Full Details"
                                className="h-7 w-7"
                              >
                                <EyeIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  retryMutation.mutate({
                                    id: item.id,
                                    req: { id: item.id },
                                  })
                                }
                                disabled={retryMutation.isPending}
                                className="h-7 gap-1 px-2 text-xs hover:bg-primary/10 hover:text-primary"
                              >
                                <RotateCwIcon
                                  className={`h-3 w-3 ${retryMutation.isPending ? "animate-spin" : ""}`}
                                />
                                Retry
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          No message delivery records found matching your
                          filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Shared Pagination Controls */}
              <div className="flex items-center justify-between border-t border-border/40 bg-muted/10 p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Page {tokenHistory.length + 1}</span>
                  {deliveriesData?.deliveries && (
                    <span className="rounded border border-border/40 bg-muted/50 px-2 py-0.5 font-mono text-[11px]">
                      {deliveriesData.deliveries.length} items
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
                        disabled={!deliveriesData?.nextPageToken}
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
        </div>

        {/* Delivery Details Modal Dialog */}
        <Dialog
          open={!!selectedDelivery}
          onOpenChange={(open) => !open && setSelectedDelivery(null)}
        >
          <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-6 sm:max-w-2xl">
            <DialogHeader className="shrink-0 pb-2">
              <div className="flex items-center justify-between gap-3 pr-6">
                <DialogTitle className="truncate font-mono text-base font-bold">
                  {selectedDelivery?.id}
                </DialogTitle>
                {selectedDelivery && getStatusBadge(selectedDelivery.status)}
              </div>
              <DialogDescription className="truncate text-xs">
                Delivery record for topic{" "}
                <span className="font-mono font-semibold text-foreground">
                  {selectedDelivery?.topic}
                </span>
              </DialogDescription>
            </DialogHeader>

            {selectedDelivery && (
              <div className="flex-1 space-y-4 overflow-y-auto py-2 pr-1">
                {/* Metadata Grid */}
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/50 bg-muted/20 p-3.5 text-xs sm:grid-cols-2">
                  <div>
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      Message ID
                    </span>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono font-semibold text-foreground">
                      <span className="truncate">
                        {selectedDelivery.messageId}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-5 w-5 shrink-0"
                        onClick={() =>
                          handleCopy(selectedDelivery.messageId, "msgId")
                        }
                      >
                        {copiedKey === "msgId" ? (
                          <CheckIcon className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <CopyIcon className="h-3 w-3 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      Subscriber ID
                    </span>
                    <span className="mt-0.5 block truncate font-mono font-semibold text-foreground">
                      {selectedDelivery.subscriberId}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      Attempts
                    </span>
                    <span className="mt-0.5 block font-mono font-semibold text-foreground">
                      {selectedDelivery.attempts} /{" "}
                      {selectedDelivery.maxAttempts}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      Created Time
                    </span>
                    <span className="mt-0.5 block truncate font-medium text-foreground">
                      {new Date(selectedDelivery.createTime).toLocaleString()}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      Schedule Time
                    </span>
                    <span className="mt-0.5 block truncate font-medium text-foreground">
                      {new Date(selectedDelivery.scheduleTime).toLocaleString()}
                    </span>
                  </div>

                  <div>
                    <span className="block text-[11px] font-medium text-muted-foreground">
                      Last Update
                    </span>
                    <span className="mt-0.5 block truncate font-medium text-foreground">
                      {new Date(selectedDelivery.updateTime).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Full Error Trace Callout */}
                {selectedDelivery.lastError ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                        <AlertOctagonIcon className="h-4 w-4 shrink-0" />
                        Execution Error Trace
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          handleCopy(selectedDelivery.lastError, "error")
                        }
                        className="h-6 shrink-0 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {copiedKey === "error" ? (
                          <>
                            <CheckIcon className="h-3 w-3 text-emerald-500" />
                            Copied
                          </>
                        ) : (
                          <>
                            <CopyIcon className="h-3 w-3" />
                            Copy Error
                          </>
                        )}
                      </Button>
                    </div>
                    <pre className="max-h-64 overflow-y-auto rounded-lg border border-destructive/20 bg-destructive/5 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-destructive select-text">
                      {selectedDelivery.lastError}
                    </pre>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2Icon className="h-4 w-4 shrink-0" />
                    <span>No errors recorded for this delivery event.</span>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="shrink-0 gap-2 border-t border-border/40 pt-2 sm:gap-0">
              {selectedDelivery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    retryMutation.mutate({
                      id: selectedDelivery.id,
                      req: { id: selectedDelivery.id },
                    })
                  }}
                  disabled={retryMutation.isPending}
                  className="gap-1.5"
                >
                  <RotateCwIcon
                    className={`h-3.5 w-3.5 ${retryMutation.isPending ? "animate-spin" : ""}`}
                  />
                  Retry Delivery Now
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageLayout>
    </TooltipProvider>
  )
}
