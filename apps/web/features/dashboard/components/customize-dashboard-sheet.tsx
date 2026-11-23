import { useMemo, useState, type ElementType, type ReactElement } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarClock,
  Landmark,
  Loader2,
  Mail,
  PiggyBank,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Workflow,
} from "lucide-react"
import {
  DASHBOARD_PRESETS,
  DASHBOARD_WIDGET_CATALOG,
  DASHBOARD_WIDGET_MAP,
  DEFAULT_DASHBOARD_WIDGETS,
  normalizeDashboardWidgets,
  type DashboardWidgetId,
} from "@saturn/core"
import {
  getLocalizedDashboardPresetMeta,
  getLocalizedDashboardWidgetMeta,
} from "@saturn/i18n"
import {
  useUpdateDashboardPreferencesMutation,
  type DashboardPreferences,
} from "@saturn/api/gen/saturn/space/v1/space"
import { useI18n } from "@saturn/hooks"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

const WIDGET_ICONS: Record<DashboardWidgetId, ElementType> = {
  ai_quick_ask: Sparkles,
  net_worth: Landmark,
  budget_pace: PiggyBank,
  upcoming_bills: CalendarClock,
  today_schedule: Calendar,
  priority_mail: Mail,
  workflow_runs: Workflow,
}

export interface CustomizeDashboardPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPreviewChange?: (widgets: DashboardWidgetId[] | null) => void
  spaceId: string
  preferences?: DashboardPreferences
  activeWidgets: DashboardWidgetId[]
  trigger?: ReactElement
}

export type CustomizeDashboardSheetProps = CustomizeDashboardPopoverProps

export function CustomizeDashboardPopover({
  open,
  onOpenChange,
  onPreviewChange,
  spaceId,
  preferences,
  activeWidgets,
  trigger,
}: CustomizeDashboardPopoverProps) {
  const queryClient = useQueryClient()
  const { t, locale, language } = useI18n()
  const [draftWidgets, setDraftWidgets] =
    useState<DashboardWidgetId[]>(activeWidgets)
  const [prevOpen, setPrevOpen] = useState(open)

  if (open && !prevOpen) {
    setPrevOpen(true)
    setDraftWidgets(normalizeDashboardWidgets(activeWidgets))
  } else if (!open && prevOpen) {
    setPrevOpen(false)
  }

  const updateMutation = useUpdateDashboardPreferencesMutation()

  const orderedRows = useMemo(() => {
    const enabledSet = new Set(draftWidgets)
    const disabled = DASHBOARD_WIDGET_CATALOG.filter(
      (w) => !enabledSet.has(w.id)
    ).map((w) => ({
      ...w,
      ...getLocalizedDashboardWidgetMeta(w.id, locale),
      enabled: false,
    }))

    const enabled = draftWidgets.map((id) => ({
      ...DASHBOARD_WIDGET_MAP[id],
      ...getLocalizedDashboardWidgetMeta(id, locale),
      enabled: true,
    }))

    return [...enabled, ...disabled]
  }, [draftWidgets, locale])

  const localizedPresets = useMemo(
    () =>
      DASHBOARD_PRESETS.map((preset) => ({
        ...preset,
        ...getLocalizedDashboardPresetMeta(preset.id, locale),
      })),
    [locale]
  )

  const activePresetId = useMemo(() => {
    for (const preset of DASHBOARD_PRESETS) {
      if (
        preset.widgets.length === draftWidgets.length &&
        preset.widgets.every((id, idx) => draftWidgets[idx] === id)
      ) {
        return preset.id
      }
    }
    return null
  }, [draftWidgets])

  const isDirty = useMemo(
    () =>
      draftWidgets.length !== activeWidgets.length ||
      draftWidgets.some((id, idx) => id !== activeWidgets[idx]),
    [draftWidgets, activeWidgets]
  )

  const applyDraft = (next: DashboardWidgetId[]) => {
    setDraftWidgets(next)
    onPreviewChange?.(next)
  }

  const handlePopoverOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onPreviewChange?.(null)
    }
    onOpenChange(nextOpen)
  }

  const handleToggleWidget = (id: DashboardWidgetId, nextChecked: boolean) => {
    if (nextChecked) {
      if (draftWidgets.includes(id)) return
      applyDraft([...draftWidgets, id])
      return
    }
    if (draftWidgets.length <= 1) {
      return
    }
    applyDraft(draftWidgets.filter((item) => item !== id))
  }

  const handleMoveWidget = (
    id: DashboardWidgetId,
    direction: "up" | "down"
  ) => {
    const idx = draftWidgets.indexOf(id)
    if (idx === -1) return
    const targetIdx = direction === "up" ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= draftWidgets.length) return
    const next = [...draftWidgets]
    const [moved] = next.splice(idx, 1)
    next.splice(targetIdx, 0, moved)
    applyDraft(next)
  }

  const handleReset = () => {
    applyDraft([...DEFAULT_DASHBOARD_WIDGETS])
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        space_id: spaceId,
        req: {
          spaceId,
          dashboardPreferences: {
            widgets: draftWidgets,
          },
          updateMask: { paths: ["widgets"] },
          version: preferences?.version,
        },
      })
      await queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/dashboard-preferences`],
      })
      toast.add({
        type: "success",
        title: t("dashboard.updatedToast"),
        description: t("dashboard.updatedToastDesc"),
      })
      onPreviewChange?.(null)
      onOpenChange(false)
    } catch (err) {
      toast.add({
        type: "error",
        title: t("dashboard.saveFailedToast"),
        description:
          err instanceof Error ? err.message : t("common.pleaseTryAgain"),
      })
    }
  }

  return (
    <Popover open={open} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger
        render={
          trigger ?? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer gap-1.5"
            >
              <SlidersHorizontal className="size-3.5" />
              <span>{t("common.customize")}</span>
            </Button>
          )
        }
      />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl border border-border bg-popover p-0 shadow-xl"
      >
        <PopoverHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <PopoverTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <SlidersHorizontal className="size-4 text-primary" />
            <span>{t("dashboard.customizeTitle")}</span>
          </PopoverTitle>
          <PopoverDescription className="text-xs text-muted-foreground">
            {t("dashboard.customizeDescription")}
          </PopoverDescription>
        </PopoverHeader>

        <div className="max-h-[min(26rem,60svh)] overflow-y-auto px-4 py-3.5">
          {/* Section 1: Space Presets */}
          <section className="space-y-2.5 pb-4">
            <div>
              <h2 className="text-[13px] font-medium text-foreground">
                {t("dashboard.presets")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {language === "es"
                  ? "Aplica una configuración predefinida en un clic."
                  : "Apply a curated widget arrangement in one click."}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {localizedPresets.map((preset) => {
                const isActive = activePresetId === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyDraft([...preset.widgets])}
                    className={cn(
                      "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Section 2: Widgets & Order */}
          <section className="space-y-2.5 border-t border-border/40 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[13px] font-medium text-foreground">
                  {t("dashboard.widgets")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {language === "es"
                    ? "Debe permanecer activo al menos un widget."
                    : "At least one widget must remain enabled."}
                </p>
              </div>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {draftWidgets.length} {language === "es" ? "activos" : "active"}
              </span>
            </div>

            <div className="divide-y divide-border/40">
              {orderedRows.map((widget) => {
                const enabledIndex = draftWidgets.indexOf(widget.id)
                const isLastEnabled = widget.enabled && draftWidgets.length <= 1
                const WidgetIcon = WIDGET_ICONS[widget.id]

                return (
                  <div
                    key={widget.id}
                    className="flex items-center justify-between gap-2.5 py-2.5 first:pt-1 last:pb-1"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <WidgetIcon
                          className={cn(
                            "size-3.5 shrink-0",
                            widget.enabled
                              ? "text-primary"
                              : "text-muted-foreground"
                          )}
                        />
                        <span
                          className={cn(
                            "truncate text-xs font-medium",
                            widget.enabled
                              ? "text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {widget.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {widget.span === "wide"
                            ? language === "es"
                              ? "Ancho"
                              : "Wide"
                            : language === "es"
                              ? "1 col"
                              : "1 col"}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">
                        {widget.description}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      {widget.enabled && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={enabledIndex === 0}
                            onClick={() => handleMoveWidget(widget.id, "up")}
                            aria-label={
                              language === "es"
                                ? `Mover ${widget.title} arriba`
                                : `Move ${widget.title} up`
                            }
                            className="cursor-pointer"
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={enabledIndex === draftWidgets.length - 1}
                            onClick={() => handleMoveWidget(widget.id, "down")}
                            aria-label={
                              language === "es"
                                ? `Mover ${widget.title} abajo`
                                : `Move ${widget.title} down`
                            }
                            className="cursor-pointer"
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                        </>
                      )}
                      <Switch
                        checked={widget.enabled}
                        disabled={isLastEnabled}
                        onCheckedChange={(checked) =>
                          handleToggleWidget(widget.id, checked)
                        }
                        aria-label={
                          language === "es"
                            ? `Alternar ${widget.title}`
                            : `Toggle ${widget.title}`
                        }
                        className="ml-1"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 bg-popover px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={updateMutation.isPending}
            className="cursor-pointer gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            <span>{language === "es" ? "Restablecer" : "Reset"}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePopoverOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending || !isDirty}
              className="min-w-24 cursor-pointer"
            >
              {updateMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              <span>
                {language === "es" ? "Guardar diseño" : "Save Layout"}
              </span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { CustomizeDashboardPopover as CustomizeDashboardSheet }
