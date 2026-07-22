import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListBackupsQuery,
  useTriggerBackupMutation,
} from "@/gen/saturn/platform/backup/v1/backup"
import { Button } from "@/components/ui/button"
import {
  DatabaseIcon,
  RefreshCwIcon,
  PlayIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  CalendarIcon,
  ClipboardIcon,
  CheckIcon,
} from "lucide-react"
import { PageLayout } from "@/components/ui/page-layout"

export function BackupAdminView() {
  const queryClient = useQueryClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Fetch index
  const { data, isLoading, refetch } = useListBackupsQuery({})

  // Trigger manual backup
  const triggerMutation = useTriggerBackupMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/backups"],
      })
    },
  })

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Format timestamp nicely
  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return "Never"
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    } catch {
      return "Never"
    }
  }

  // Format file size
  const formatBytes = (bytes: string | number) => {
    const num = typeof bytes === "string" ? parseInt(bytes, 10) : bytes
    if (isNaN(num) || num === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(num) / Math.log(k))
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const backups = data?.backups || []
  const lastUpdated = data?.lastUpdated
    ? formatDateTime(data.lastUpdated)
    : "Never"
  const successBackups = backups.filter((b) => b.status === "success")

  const backupActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={() => refetch()}
        disabled={isLoading}
        className="cursor-pointer rounded-xl border-border/50 bg-background/50 hover:bg-muted/80"
      >
        <RefreshCwIcon
          className={`mr-2 h-4 w-4 text-muted-foreground ${
            isLoading ? "animate-spin" : ""
          }`}
        />
        Sync Index
      </Button>

      <Button
        onClick={() => triggerMutation.mutate({})}
        disabled={triggerMutation.isPending}
        className="cursor-pointer rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 font-semibold text-white shadow-md transition-all hover:from-emerald-500 hover:to-teal-500 focus:ring-2 focus:ring-emerald-500/20"
      >
        <PlayIcon
          className={`mr-2 h-4 w-4 ${
            triggerMutation.isPending ? "animate-spin" : ""
          }`}
        />
        Backup Now
      </Button>
    </div>
  )

  return (
    <PageLayout
      title="Database Backups"
      description="Manage your Postgres database snapshots, track logs, and verify storage backups."
      icon={DatabaseIcon}
      actions={backupActions}
    >
      {/* Info Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-3xl border border-border/50 bg-card/45 p-6 shadow-md backdrop-blur-xl">
          <div className="rounded-2xl bg-indigo-500/10 p-3.5 text-indigo-500 dark:bg-indigo-500/15">
            <DatabaseIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Total Backups
            </p>
            <h4 className="mt-0.5 text-2xl font-bold text-foreground">
              {backups.length}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-3xl border border-border/50 bg-card/45 p-6 shadow-md backdrop-blur-xl">
          <div className="rounded-2xl bg-emerald-500/10 p-3.5 text-emerald-500 dark:bg-emerald-500/15">
            <CheckCircle2Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Successful
            </p>
            <h4 className="mt-0.5 text-2xl font-bold text-foreground">
              {successBackups.length}
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-3xl border border-border/50 bg-card/45 p-6 shadow-md backdrop-blur-xl">
          <div className="rounded-2xl bg-amber-500/10 p-3.5 text-amber-500 dark:bg-amber-500/15">
            <CalendarIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Index Last Updated
            </p>
            <h4 className="mt-1.5 max-w-[200px] truncate text-sm font-semibold text-foreground">
              {lastUpdated}
            </h4>
          </div>
        </div>
      </div>

      {/* Feedback Messages */}
      {triggerMutation.isSuccess && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2Icon className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <span className="font-bold">Backup Completed Successfully: </span>
            {triggerMutation.data?.backup.filename} (
            {formatBytes(triggerMutation.data?.backup.sizeBytes)})
          </div>
        </div>
      )}

      {triggerMutation.isError && (
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertCircleIcon className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <span className="font-bold">Backup Failed: </span>
            {triggerMutation.error?.message}
          </div>
        </div>
      )}

      {/* Backups List Table */}
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/45 shadow-xl backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <th className="px-6 py-4">Snapshot Name</th>
                <th className="px-6 py-4">Size</th>
                <th className="px-6 py-4">Triggered By</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">SHA256 Checksum</th>
                <th className="px-6 py-4">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 text-sm">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-muted-foreground"
                  >
                    <RefreshCwIcon className="mx-auto mb-2 h-6 w-6 animate-spin text-muted-foreground/60" />
                    Loading backups list...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-muted-foreground"
                  >
                    <DatabaseIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                    No backups found. Click "Backup Now" to trigger your first
                    snapshot.
                  </td>
                </tr>
              ) : (
                backups
                  .slice()
                  .reverse() // Show newest first
                  .map((b) => (
                    <tr
                      key={b.id}
                      className="transition-colors hover:bg-muted/10"
                    >
                      <td className="px-6 py-4 font-mono font-medium text-foreground">
                        {b.filename}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatBytes(b.sizeBytes)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-lg bg-muted/65 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          {b.triggeredBy}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {b.status === "success" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex max-w-[180px] items-center gap-2">
                          <span
                            className="truncate font-mono text-xs text-muted-foreground/75"
                            title={b.sha256}
                          >
                            {b.sha256}
                          </span>
                          <button
                            onClick={() => handleCopy(b.sha256, b.id)}
                            className="cursor-pointer rounded p-1 text-muted-foreground/50 transition-all hover:bg-muted/60 hover:text-foreground"
                            title="Copy Checksum"
                          >
                            {copiedId === b.id ? (
                              <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <ClipboardIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDateTime(b.createdAt)}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  )
}
