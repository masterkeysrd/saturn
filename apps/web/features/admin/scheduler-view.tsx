import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListSchedulesQuery,
  useListJobsQuery,
  useTriggerScheduleMutation,
  usePauseScheduleMutation,
  useResumeScheduleMutation,
  useRetryJobMutation,
  useDeleteJobMutation,
  useGetSchedulerStatusQuery,
} from "@/gen/saturn/platform/scheduler/v1/admin"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  RefreshCwIcon,
  PlayIcon,
  PauseIcon,
  CalendarIcon,
  TrashIcon,
  RotateCwIcon,
  AlertOctagonIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
  ActivityIcon,
  LayersIcon,
} from "lucide-react"

export function SchedulerAdminView() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<"schedules" | "jobs">("schedules")
  const [jobStatusFilter, setJobStatusFilter] = useState<string>("")
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0)

  // Queries
  const {
    data: scheduleData,
    isLoading: schedulesLoading,
    isError: schedulesError,
    refetch: refetchSchedules,
  } = useListSchedulesQuery({})

  const {
    data: jobData,
    isLoading: jobsLoading,
    isError: jobsError,
    refetch: refetchJobs,
  } = useListJobsQuery({ status: jobStatusFilter })

  const {
    data: statusData,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useGetSchedulerStatusQuery({})

  // Auto-Refresh Effect
  useEffect(() => {
    if (autoRefreshInterval === 0) return
    const interval = setInterval(() => {
      refetchSchedules()
      refetchJobs()
      refetchStatus()
    }, autoRefreshInterval)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshInterval])

  // Mutations
  const triggerMutation = useTriggerScheduleMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/scheduler/jobs"],
      })
      refetchStatus()
    },
  })

  const pauseMutation = usePauseScheduleMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/scheduler/schedules"],
      })
    },
  })

  const resumeMutation = useResumeScheduleMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/scheduler/schedules"],
      })
    },
  })

  const retryMutation = useRetryJobMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/scheduler/jobs"],
      })
      refetchStatus()
    },
  })

  const deleteMutation = useDeleteJobMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/scheduler/jobs"],
      })
      refetchStatus()
    },
  })

  const handleTrigger = async (id: string) => {
    try {
      await triggerMutation.mutateAsync({ id, req: { id } })
    } catch (err) {
      console.error("Failed to trigger schedule:", err)
    }
  }

  const handlePause = async (id: string) => {
    try {
      await pauseMutation.mutateAsync({ id, req: { id } })
    } catch (err) {
      console.error("Failed to pause schedule:", err)
    }
  }

  const handleResume = async (id: string) => {
    try {
      await resumeMutation.mutateAsync({ id, req: { id } })
    } catch (err) {
      console.error("Failed to resume schedule:", err)
    }
  }

  const handleRetry = async (id: string) => {
    try {
      await retryMutation.mutateAsync({ id, req: { id } })
    } catch (err) {
      console.error("Failed to retry job:", err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ id, req: { id } })
    } catch (err) {
      console.error("Failed to delete job:", err)
    }
  }

  const isActionPending =
    triggerMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    retryMutation.isPending ||
    deleteMutation.isPending

  const formatTime = (timeStr: string) => {
    if (!timeStr) return "N/A"
    const d = new Date(timeStr)
    return d.toLocaleString()
  }

  // Calculate summary stats
  const totalSchedules = scheduleData?.schedules?.length || 0
  const activeSchedules =
    scheduleData?.schedules?.filter((s) => s.status === "active").length || 0
  const pausedSchedules = totalSchedules - activeSchedules

  return (
    <div className="flex flex-1 flex-col space-y-6">
      {/* Header section */}
      <div className="flex flex-col space-y-4 select-none sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h1 className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-3xl font-extrabold tracking-tight text-foreground">
            Platform Scheduler Panel
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor, run, and manage background cron jobs and execution queues.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start">
          {/* Pulsating Live indicator */}
          {autoRefreshInterval > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-[10px] font-semibold text-green-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
              Live
            </div>
          )}

          {/* Auto-Refresh selection dropdown */}
          <Select
            value={autoRefreshInterval.toString()}
            onValueChange={(val) => setAutoRefreshInterval(Number(val))}
          >
            <SelectTrigger className="w-[160px] cursor-pointer rounded-xl border border-border/60 bg-muted/30 text-xs font-semibold hover:bg-muted/50 dark:bg-muted/10">
              <SelectValue>
                {autoRefreshInterval === 0 && "Manual Refresh"}
                {autoRefreshInterval === 5000 && "Auto Update (5s)"}
                {autoRefreshInterval === 10000 && "Auto Update (10s)"}
                {autoRefreshInterval === 15000 && "Auto Update (15s)"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
              <SelectItem value="0">Manual Refresh</SelectItem>
              <SelectItem value="5000">Auto Update (5s)</SelectItem>
              <SelectItem value="10000">Auto Update (10s)</SelectItem>
              <SelectItem value="15000">Auto Update (15s)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchSchedules()
              refetchJobs()
              refetchStatus()
            }}
            disabled={schedulesLoading || jobsLoading || statusLoading}
            className="cursor-pointer rounded-xl"
          >
            <RefreshCwIcon
              className={`mr-2 h-4 w-4 ${schedulesLoading || jobsLoading || statusLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Operational Stats Cards */}
      <div className="grid grid-cols-1 gap-4 select-none sm:grid-cols-4">
        <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/35 p-6 shadow-md backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Active Schedules
            </span>
            <CalendarIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">{activeSchedules}</span>
            <span className="text-xs text-muted-foreground">
              / {totalSchedules} total
            </span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/35 p-6 shadow-md backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Paused Rules
            </span>
            <PauseIcon className="h-5 w-5 text-amber-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">{pausedSchedules}</span>
            <span className="text-xs text-muted-foreground">
              currently disabled
            </span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/35 p-6 shadow-md backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Running Workers
            </span>
            <ActivityIcon className="h-5 w-5 text-green-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">
              {statusData?.workerCount ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">
              max concurrent threads
            </span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/35 p-6 shadow-md backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Jobs in Queue
            </span>
            <LayersIcon className="h-5 w-5 text-blue-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">
              {statusData?.queueSize ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">
              active job queue size
            </span>
          </div>
        </div>
      </div>

      {/* Tab Selector and Toolbar */}
      <div className="flex flex-col gap-4 select-none sm:flex-row sm:items-center sm:justify-between">
        {/* Tabs */}
        <div className="flex w-fit items-center gap-1.5 rounded-2xl border border-border/50 bg-muted/20 p-1">
          <button
            onClick={() => setActiveTab("schedules")}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeTab === "schedules"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Schedules ({totalSchedules})
          </button>
          <button
            onClick={() => setActiveTab("jobs")}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeTab === "jobs"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Execution Queue
          </button>
        </div>

        {/* Job status filter */}
        {activeTab === "jobs" && (
          <div className="flex items-center gap-1.5 rounded-2xl border border-border/50 bg-muted/20 p-1">
            <button
              onClick={() => setJobStatusFilter("")}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                jobStatusFilter === ""
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setJobStatusFilter("pending")}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                jobStatusFilter === "pending"
                  ? "bg-card text-amber-500 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setJobStatusFilter("processing")}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                jobStatusFilter === "processing"
                  ? "bg-card text-blue-500 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Processing
            </button>
            <button
              onClick={() => setJobStatusFilter("failed")}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                jobStatusFilter === "failed"
                  ? "bg-card text-red-500 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Failed
            </button>
            <button
              onClick={() => setJobStatusFilter("completed")}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                jobStatusFilter === "completed"
                  ? "bg-card text-green-500 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Completed
            </button>
          </div>
        )}
      </div>

      {/* Main Grid View */}
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/45 shadow-xl backdrop-blur-xl">
        {activeTab === "schedules" ? (
          // Tab Schedules
          schedulesLoading ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-20">
              <div className="relative flex items-center justify-center">
                <div className="absolute h-12 w-12 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary duration-1000" />
                <div className="h-4 w-4 animate-pulse rounded-full bg-gradient-to-tr from-primary to-accent" />
              </div>
              <span className="text-sm text-muted-foreground">
                Loading schedules...
              </span>
            </div>
          ) : schedulesError ? (
            <div className="flex flex-col items-center justify-center space-y-3 px-4 py-20 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertOctagonIcon className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                Failed to load schedules
              </h3>
              <p className="max-w-xs text-xs text-muted-foreground">
                An error occurred while fetching the platform schedules from the
                gateway server.
              </p>
            </div>
          ) : !scheduleData?.schedules ||
            scheduleData.schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center space-y-3 px-4 py-24 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
                <HelpCircleIcon className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                No schedules registered
              </h3>
              <p className="max-w-xs text-xs text-muted-foreground">
                There are currently no background cron jobs seeded in the
                database.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/10 text-xs font-semibold text-muted-foreground select-none">
                    <th className="px-6 py-4">Job Details</th>
                    <th className="px-6 py-4">Cron Expression</th>
                    <th className="px-6 py-4">Next Target Run</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {scheduleData.schedules.map((s) => {
                    const isActive = s.status === "active"

                    return (
                      <tr
                        key={s.id}
                        className="transition-colors hover:bg-muted/15"
                      >
                        {/* ID / Name */}
                        <td className="px-6 py-4.5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {s.id}
                            </span>
                            <span className="mt-0.5 font-mono text-xs text-muted-foreground/80">
                              Type: {s.jobType}
                            </span>
                          </div>
                        </td>

                        {/* Cron */}
                        <td className="px-6 py-4.5 font-mono text-xs text-muted-foreground">
                          {s.cronExpression}
                        </td>

                        {/* Next Run */}
                        <td className="px-6 py-4.5 font-mono text-xs text-foreground/90">
                          {formatTime(s.nextRunAt)}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4.5">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                              isActive
                                ? "border-green-500/20 bg-green-500/10 text-green-400"
                                : "border-amber-500/20 bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isActive ? (
                              <Button
                                onClick={() => handlePause(s.id)}
                                disabled={isActionPending}
                                variant="ghost"
                                size="sm"
                                className="h-8 cursor-pointer rounded-xl px-2.5 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500"
                              >
                                <PauseIcon className="mr-1 h-3.5 w-3.5" />
                                Pause
                              </Button>
                            ) : (
                              <Button
                                onClick={() => handleResume(s.id)}
                                disabled={isActionPending}
                                variant="ghost"
                                size="sm"
                                className="h-8 cursor-pointer rounded-xl px-2.5 text-green-500 hover:bg-green-500/10 hover:text-green-500"
                              >
                                <PlayIcon className="mr-1 h-3.5 w-3.5" />
                                Resume
                              </Button>
                            )}

                            <Button
                              onClick={() => handleTrigger(s.id)}
                              disabled={isActionPending}
                              className="h-8 cursor-pointer rounded-xl bg-primary px-3 text-primary-foreground shadow-sm hover:bg-primary/95"
                            >
                              <PlayIcon className="mr-1.5 h-3.5 w-3.5 fill-current" />
                              Run Now
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : // Tab Jobs
        jobsLoading ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-20">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-12 w-12 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary duration-1000" />
              <div className="h-4 w-4 animate-pulse rounded-full bg-gradient-to-tr from-primary to-accent" />
            </div>
            <span className="text-sm text-muted-foreground">
              Loading queue...
            </span>
          </div>
        ) : jobsError ? (
          <div className="flex flex-col items-center justify-center space-y-3 px-4 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertOctagonIcon className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              Failed to load queue
            </h3>
            <p className="max-w-xs text-xs text-muted-foreground">
              An error occurred while fetching the execution queue from the
              gateway.
            </p>
          </div>
        ) : !jobData?.jobs || jobData.jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-3 px-4 py-24 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
              <CheckCircle2Icon className="h-6 w-6 text-green-500" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              Queue is completely empty
            </h3>
            <p className="max-w-xs text-xs text-muted-foreground">
              No background jobs matching the status filter are currently
              waiting in the execution queue.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/10 text-xs font-semibold text-muted-foreground select-none">
                  <th className="px-6 py-4">Job Info</th>
                  <th className="px-6 py-4">Schedule ID</th>
                  <th className="px-6 py-4">Attempts</th>
                  <th className="px-6 py-4">Execution Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {jobData.jobs.map((j) => {
                  const isFailed = j.status === "failed"
                  const isProcessing = j.status === "processing"

                  return (
                    <tr
                      key={j.id}
                      className="transition-colors hover:bg-muted/15"
                    >
                      {/* Job ID / Details */}
                      <td className="px-6 py-4.5">
                        <div className="flex min-w-[200px] flex-col">
                          <span className="font-mono text-xs font-semibold text-foreground/90">
                            {j.id}
                          </span>
                          <span className="mt-0.5 text-xs font-semibold text-muted-foreground">
                            {j.jobType}
                          </span>
                          {j.lastError && (
                            <span className="mt-1 max-w-sm rounded border border-red-500/10 bg-red-500/5 px-2 py-1 font-mono text-[10px] break-all text-destructive">
                              Err: {j.lastError}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Schedule ID */}
                      <td className="px-6 py-4.5 font-mono text-xs text-muted-foreground">
                        {j.scheduleId || "One-Off Job"}
                      </td>

                      {/* Attempts */}
                      <td className="px-6 py-4.5 font-mono text-xs text-foreground/90">
                        {j.attempts} / {j.maxAttempts}
                      </td>

                      {/* Run At */}
                      <td className="px-6 py-4.5 font-mono text-xs text-foreground/90">
                        {formatTime(j.runAt)}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                            isFailed
                              ? "border-destructive/20 bg-destructive/10 text-destructive"
                              : isProcessing
                                ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
                                : j.status === "completed"
                                  ? "border-green-500/20 bg-green-500/10 text-green-400"
                                  : "border-amber-500/20 bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isFailed && (
                            <Button
                              onClick={() => handleRetry(j.id)}
                              disabled={isActionPending}
                              variant="ghost"
                              size="sm"
                              className="h-8 cursor-pointer rounded-xl px-2.5 text-green-500 hover:bg-green-500/10 hover:text-green-500"
                            >
                              <RotateCwIcon className="mr-1 h-3.5 w-3.5" />
                              Retry
                            </Button>
                          )}

                          {!isProcessing && (
                            <Button
                              onClick={() => handleDelete(j.id)}
                              disabled={isActionPending}
                              variant="ghost"
                              size="sm"
                              className="h-8 cursor-pointer rounded-xl px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <TrashIcon className="mr-1 h-3.5 w-3.5" />
                              {j.status === "pending" ? "Cancel" : "Delete"}
                            </Button>
                          )}

                          {isProcessing && (
                            <span className="text-xs text-muted-foreground/60 select-none">
                              Running...
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
export default SchedulerAdminView
