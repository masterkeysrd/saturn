import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useDeleteModelMutation,
  useDeleteProviderMutation,
  useGetSettingsQuery,
  useListModelsQuery,
  useListProvidersQuery,
  useSyncProviderModelsMutation,
  useTestProviderMutation,
  useUpdateSettingsMutation,
  type Model,
  type Provider,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { PageLayout } from "@/components/ui/page-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ModelSelector,
  ModelSelectorButton,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector"
import { ProviderLogo } from "./components/provider-logo"
import { ProviderSheet } from "./components/provider-sheet"
import { ModelSheet } from "./components/model-sheet"
import {
  CheckIcon,
  ChevronDownIcon,
  CpuIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react"

function RoleModelPicker({
  label,
  description,
  modelId,
  models,
  disabled,
  onSelect,
}: {
  label: string
  description: string
  modelId?: string
  models: Model[]
  disabled: boolean
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const active = models.find((m) => m.id === modelId)

  return (
    <div className="flex flex-col justify-between gap-2 rounded-xl border border-border/50 bg-background/60 p-3.5">
      <div>
        <div className="text-xs font-semibold">{label}</div>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <ModelSelector open={open} onOpenChange={setOpen}>
        <ModelSelectorTrigger
          render={
            <ModelSelectorButton
              disabled={disabled}
              className="w-full justify-between rounded-xl"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ModelSelectorLogo driver={active?.providerDriver} />
                <span className="truncate">
                  {active?.displayName ?? "Not configured"}
                </span>
              </span>
              <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
            </ModelSelectorButton>
          }
        />
        <ModelSelectorContent title={label}>
          <ModelSelectorInput placeholder="Search registered models..." />
          <ModelSelectorList>
            <ModelSelectorEmpty>No enabled models found.</ModelSelectorEmpty>
            <ModelSelectorGroup heading="Registered Models">
              {models.map((m) => (
                <ModelSelectorItem
                  key={m.id}
                  value={`${m.displayName} ${m.modelId} ${m.providerName}`}
                  onSelect={() => {
                    if (m.id) onSelect(m.id)
                    setOpen(false)
                  }}
                >
                  <ModelSelectorLogo driver={m.providerDriver} />
                  <ModelSelectorName>{m.displayName}</ModelSelectorName>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {m.providerName}
                  </span>
                  {modelId === m.id && (
                    <CheckIcon className="size-3.5 text-primary" />
                  )}
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelector>
    </div>
  )
}

export function ModelsView() {
  const queryClient = useQueryClient()
  const { spaceRole } = useActiveSpaceContext()
  const canManageSettings = spaceRole === "owner" || spaceRole === "admin"

  const { data: settingsData } = useGetSettingsQuery({})
  const { data: providersData } = useListProvidersQuery({})
  const { data: modelsData } = useListModelsQuery({})

  const providers = providersData?.providers ?? []
  const models = modelsData?.models ?? []
  const enabledModels = models.filter((m) => m.isEnabled)

  const [providerSheetOpen, setProviderSheetOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [modelSheetOpen, setModelSheetOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<Model | null>(null)

  const invalidateAll = () => {
    void queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/ai/settings"],
    })
    void queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/ai/providers"],
    })
    void queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/ai/models"],
    })
  }

  const updateSettings = useUpdateSettingsMutation({
    onSuccess: invalidateAll,
  })
  const testProvider = useTestProviderMutation({ onSuccess: invalidateAll })
  const syncProvider = useSyncProviderModelsMutation({
    onSuccess: invalidateAll,
  })
  const deleteProvider = useDeleteProviderMutation({
    onSuccess: invalidateAll,
  })
  const deleteModel = useDeleteModelMutation({ onSuccess: invalidateAll })

  const handleRoleChange = (
    slot: "defaultModelId" | "fastModelId" | "reasoningModelId",
    maskPath: string,
    id: string
  ) => {
    if (!settingsData) return
    updateSettings.mutate({
      settings: {
        ...settingsData,
        models: {
          ...settingsData.models,
          [slot]: id,
        },
      },
      updateMask: { paths: [maskPath] },
    })
  }

  return (
    <PageLayout
      title="Models & Providers"
      description="Connect LLM providers, manage workspace models, and configure role defaults."
      actions={
        canManageSettings ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditingModel(null)
                setModelSheetOpen(true)
              }}
              disabled={providers.length === 0}
              className="cursor-pointer gap-1.5"
            >
              <PlusIcon className="size-4" />
              Add Model
            </Button>
            <Button
              onClick={() => {
                setEditingProvider(null)
                setProviderSheetOpen(true)
              }}
              className="cursor-pointer gap-1.5"
            >
              <PlusIcon className="size-4" />
              Connect Provider
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-8">
        <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Workspace Role Defaults</h2>
              <p className="text-xs text-muted-foreground">
                Default semantic slots used by chat threads and workflow{" "}
                <code>llm.generate</code> steps.
              </p>
            </div>
            {settingsData && (
              <Badge variant="outline" className="font-mono text-xs">
                Month Spend: $
                {(settingsData.currentMonthSpendUsd ?? 0).toFixed(4)}
                {settingsData.governance?.monthlyBudgetUsd
                  ? ` / $${settingsData.governance.monthlyBudgetUsd.toFixed(2)}`
                  : ""}
              </Badge>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <RoleModelPicker
              label="Default"
              description="General chat & everyday tasks"
              modelId={settingsData?.models?.defaultModelId}
              models={enabledModels}
              disabled={!canManageSettings}
              onSelect={(id) =>
                handleRoleChange(
                  "defaultModelId",
                  "models.default_model_id",
                  id
                )
              }
            />
            <RoleModelPicker
              label="Fast"
              description="Low-latency extraction & classification"
              modelId={settingsData?.models?.fastModelId}
              models={enabledModels}
              disabled={!canManageSettings}
              onSelect={(id) =>
                handleRoleChange("fastModelId", "models.fast_model_id", id)
              }
            />
            <RoleModelPicker
              label="Reasoning"
              description="Complex analysis & planning"
              modelId={settingsData?.models?.reasoningModelId}
              models={enabledModels}
              disabled={!canManageSettings}
              onSelect={(id) =>
                handleRoleChange(
                  "reasoningModelId",
                  "models.reasoning_model_id",
                  id
                )
              }
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Connected Providers</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-border/60 bg-card p-5"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">
                        <ProviderLogo driver={p.driver} className="size-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{p.name}</h3>
                          <Badge
                            variant={
                              p.status?.state === "healthy"
                                ? "secondary"
                                : p.status?.state === "unhealthy"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="text-[10px]"
                          >
                            {p.status?.state || "unverified"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {p.driver} · {p.modelCount} model(s)
                        </p>
                      </div>
                    </div>
                  </div>
                  {p.status?.error?.message && (
                    <p className="rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                      {p.status.error.message}
                    </p>
                  )}
                </div>

                {canManageSettings && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/40 pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        testProvider.mutate({
                          id: p.id ?? "",
                          req: { id: p.id ?? "" },
                        })
                      }
                      disabled={testProvider.isPending}
                      className="cursor-pointer gap-1 text-xs"
                    >
                      <ZapIcon className="size-3.5" />
                      Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        syncProvider.mutate({
                          id: p.id ?? "",
                          req: { id: p.id ?? "", modelIds: [] },
                        })
                      }
                      disabled={syncProvider.isPending}
                      className="cursor-pointer gap-1 text-xs"
                    >
                      <RefreshCwIcon className="size-3.5" />
                      Sync Models
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingProvider(p)
                        setProviderSheetOpen(true)
                      }}
                      className="cursor-pointer gap-1 text-xs"
                    >
                      <PencilIcon className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        deleteProvider.mutate({
                          id: p.id ?? "",
                          req: { id: p.id ?? "" },
                        })
                      }
                      disabled={deleteProvider.isPending}
                      className="cursor-pointer gap-1 text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Registered Models</h2>
          <div className="divide-y divide-border/50 rounded-2xl border border-border/60 bg-card">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderLogo driver={m.providerDriver} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {m.displayName}
                      </span>
                      {!m.isEnabled && (
                        <Badge variant="outline" className="text-[10px]">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{m.modelId}</span>
                      <span>· {m.providerName}</span>
                      {m.profile?.limits?.contextWindow ? (
                        <span>
                          · {Math.round(m.profile.limits.contextWindow / 1000)}k
                          ctx
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {m.profile?.capabilities?.toolCalling && (
                    <Badge variant="secondary" className="text-[10px]">
                      Tools
                    </Badge>
                  )}
                  {m.profile?.capabilities?.vision && (
                    <Badge variant="secondary" className="text-[10px]">
                      Vision
                    </Badge>
                  )}
                  {m.profile?.capabilities?.reasoning && (
                    <Badge variant="secondary" className="text-[10px]">
                      Reasoning
                    </Badge>
                  )}
                  {canManageSettings && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditingModel(m)
                          setModelSheetOpen(true)
                        }}
                        aria-label={`Edit ${m.displayName}`}
                        className="cursor-pointer"
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          deleteModel.mutate({
                            id: m.id ?? "",
                            req: { id: m.id ?? "" },
                          })
                        }
                        aria-label={`Delete ${m.displayName}`}
                        className="cursor-pointer text-destructive hover:text-destructive"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {models.length === 0 && (
              <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground">
                <CpuIcon className="size-4" />
                Connect a provider to auto-seed curated models.
              </div>
            )}
          </div>
        </section>
      </div>

      <ProviderSheet
        open={providerSheetOpen}
        onOpenChange={setProviderSheetOpen}
        provider={editingProvider}
      />
      <ModelSheet
        open={modelSheetOpen}
        onOpenChange={setModelSheetOpen}
        model={editingModel}
      />
    </PageLayout>
  )
}
