import { useState, useMemo } from "react"
import { useParams, Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useAuth } from "@/features/auth/use-auth"
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
} from "@saturn/api/gen/saturn/space/v1/space"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import {
  Globe,
  Clock,
  Check,
  ChevronsUpDown,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Info,
  Building2,
} from "lucide-react"

import { COMMON_TIMEZONES as ALL_TIMEZONES } from "@saturn/core"

function formatTimezonePreview(tz: string): string {
  try {
    const now = new Date()
    const timeStr = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now)
    const tzOffset =
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
      })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value || ""
    return `${timeStr} (${tzOffset || tz})`
  } catch {
    return tz
  }
}

export function SpacePreferences() {
  const { spaceId: paramSpaceId } = useParams<{ spaceId: string }>()
  const {
    spaceId: contextSpaceId,
    spaceName,
    spaceRole,
  } = useActiveSpaceContext()
  const { user } = useAuth()
  const spaceId = paramSpaceId || contextSpaceId

  const queryClient = useQueryClient()

  const {
    data: settings,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetSettingsQuery({ spaceId }, { enabled: !!spaceId })

  const updateMutation = useUpdateSettingsMutation()

  const serverTimezone = settings?.timezone || "UTC"
  const [selectedTimezone, setSelectedTimezone] = useState<string | null>(null)
  const currentTimezone = selectedTimezone ?? serverTimezone
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)

  const canManage =
    user?.role === "admin" ||
    spaceRole?.toLowerCase() === "owner" ||
    spaceRole?.toLowerCase() === "admin"

  const isDirty =
    selectedTimezone !== null && selectedTimezone !== serverTimezone

  const filteredTimezones = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ALL_TIMEZONES
    return ALL_TIMEZONES.filter((tz) => {
      const matchName = tz.toLowerCase().includes(q)
      const formattedCity = tz.replace(/_/g, " ").toLowerCase()
      return matchName || formattedCity.includes(q)
    })
  }, [search])

  const handleSave = async () => {
    if (!spaceId || !isDirty || !canManage) return

    try {
      const updated = await updateMutation.mutateAsync({
        space_id: spaceId,
        req: {
          spaceId,
          settings: {
            timezone: currentTimezone,
            version: settings?.version,
          },
          updateMask: {
            paths: ["timezone"],
          },
        },
      })

      // Invalidate and update react-query cache
      queryClient.setQueryData(
        [`/api/v1/spaces/${spaceId}/settings`, { spaceId }],
        updated
      )
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/settings`],
      })

      setSelectedTimezone(null)
      toast.add({
        type: "success",
        title: "Preferences Saved",
        description: `Workspace timezone set to ${updated.timezone || currentTimezone}.`,
      })
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to update workspace preferences"
      const isConflict =
        message.toLowerCase().includes("conflict") ||
        message.toLowerCase().includes("version mismatch")

      if (isConflict) {
        toast.add({
          type: "error",
          title: "Version Conflict",
          description:
            "The settings were modified concurrently by another user. Reloading latest configuration.",
        })
        refetch()
      } else {
        toast.add({
          type: "error",
          title: "Failed to Save Preferences",
          description: message,
        })
      }
    }
  }

  const handleReset = () => {
    setSelectedTimezone(null)
    setSearch("")
  }

  if (!spaceId) {
    return (
      <div className="space-y-4 rounded-3xl border border-border/40 bg-card/45 p-8 text-center">
        <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="text-base font-semibold text-foreground">
          No Active Workspace
        </h3>
        <p className="mx-auto max-w-sm text-xs text-muted-foreground">
          Please select or activate a workspace first to manage its preferences
          and configuration.
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/settings/spaces" />}
        >
          Go to Workspaces
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="animate-in space-y-6 duration-200 fade-in">
        <div className="flex h-64 items-center justify-center rounded-3xl border border-border/40 bg-card/45 p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-4 rounded-3xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm font-medium text-destructive">
          {error instanceof Error
            ? error.message
            : "Failed to load workspace preferences."}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="animate-in space-y-6 duration-300 fade-in">
      {/* Workspace Context Badge */}
      <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-card/30 px-5 py-3 text-xs">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Active Workspace:</span>
          <span className="font-semibold text-foreground">
            {spaceName || spaceId}
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          Config v{settings?.version ?? 1}
        </span>
      </div>

      {/* Preferences Section Card */}
      <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 shadow-lg backdrop-blur-xl md:p-8">
        <div className="pointer-events-none absolute top-0 right-0 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />

        {/* Section Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-accent text-white shadow-lg shadow-primary/20">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                Regional & Localization
              </h3>
              <p className="text-xs text-muted-foreground">
                Configure timezone rules, scheduling references, and regional
                defaults for this workspace.
              </p>
            </div>
          </div>
        </div>

        {/* Timezone Setting Field */}
        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Workspace Timezone
              </Label>
              <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Live: {formatTimezonePreview(currentTimezone)}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              All financial cycles, scheduled agent workflows, recurring
              automations, and transaction dates will coordinate against this
              primary timezone.
            </p>

            <div className="pt-2">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                  disabled={!canManage || updateMutation.isPending}
                  className={cn(
                    "flex h-11 w-full max-w-lg items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 text-left font-normal transition-all hover:border-border focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium text-foreground">
                      {currentTimezone}
                    </span>
                    <span className="hidden font-mono text-xs text-muted-foreground/80 sm:inline">
                      • {formatTimezonePreview(currentTimezone)}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </PopoverTrigger>

                <PopoverContent
                  className="w-[360px] rounded-2xl border border-border/50 bg-card/95 p-3 shadow-2xl backdrop-blur-xl sm:w-[420px]"
                  align="start"
                >
                  <div className="space-y-2.5">
                    <Input
                      placeholder="Search timezones (e.g. New_York, London, Santo_Domingo)..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-9 rounded-xl bg-muted/40 text-xs"
                      autoFocus
                    />

                    <div className="max-h-[260px] space-y-0.5 overflow-y-auto pr-1">
                      {filteredTimezones.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          No matching timezone found.
                        </div>
                      ) : (
                        filteredTimezones.map((tz) => {
                          const isSelected = tz === currentTimezone
                          return (
                            <button
                              key={tz}
                              type="button"
                              onClick={() => {
                                setSelectedTimezone(tz)
                                setOpen(false)
                                setSearch("")
                              }}
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                                isSelected
                                  ? "bg-primary/10 font-semibold text-primary"
                                  : "text-foreground hover:bg-accent/60"
                              )}
                            >
                              <div className="flex flex-col">
                                <span>{tz}</span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {formatTimezonePreview(tz)}
                                </span>
                              </div>
                              {isSelected && (
                                <Check className="h-4 w-4 shrink-0 text-primary" />
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {!canManage && (
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                Only workspace owners and administrators can modify workspace
                regional preferences.
              </span>
            </div>
          )}

          {isDirty && (
            <div className="flex animate-in items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-primary duration-200 fade-in">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>
                You have unsaved changes. Remember to click &ldquo;Save
                Preferences&rdquo; below to apply them.
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 border-t border-border/40 pt-6">
          {isDirty && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={updateMutation.isPending}
              onClick={handleReset}
              className="rounded-xl"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            disabled={!isDirty || !canManage || updateMutation.isPending}
            onClick={handleSave}
            className="rounded-xl bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/10 transition-opacity hover:opacity-95"
          >
            {updateMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Save Preferences
          </Button>
        </div>
      </div>

      {/* Extensibility Info Note */}
      <div className="flex items-start gap-3 rounded-2xl border border-border/30 bg-muted/15 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          Workspace settings are persisted with optimistic concurrency control.
          Additional workspace configurations (such as formatting conventions
          and system rules) will automatically appear in this section.
        </div>
      </div>
    </div>
  )
}
