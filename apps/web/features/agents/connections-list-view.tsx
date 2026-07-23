import { useState } from "react"
import {
  useListProvidersQuery,
  useCreateProviderMutation,
  useUpdateProviderMutation,
  useDeleteProviderMutation,
  useGetProviderCatalogQuery,
  type LLMProvider,
} from "@/gen/saturn/platform/agent/v1/agent"
import { PageLayout } from "@/components/ui/page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Key, Plus, Trash2, ArrowRight } from "lucide-react"

export function ConnectionsListView() {
  const { data: providersData, refetch: refetchProviders } =
    useListProvidersQuery({})
  const { data: providerCatalog } = useGetProviderCatalogQuery({})

  const createProvider = useCreateProviderMutation({
    onSuccess: () => refetchProviders(),
  })
  const updateProvider = useUpdateProviderMutation({
    onSuccess: () => refetchProviders(),
  })
  const deleteProvider = useDeleteProviderMutation({
    onSuccess: () => refetchProviders(),
  })

  const [activeSheet, setActiveSheet] = useState<"none" | "provider">("none")
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(
    null
  )

  const [providerForm, setProviderForm] = useState({
    id: "",
    name: "",
    compatibilityMode: "GEMINI_NATIVE",
    apiUrl: "",
    apiKey: "",
  })

  const openProviderSheet = (p: LLMProvider | null) => {
    if (p) {
      setSelectedProvider(p)
      setProviderForm({
        id: p.id,
        name: p.name,
        compatibilityMode: p.compatibilityMode,
        apiUrl: p.apiUrl || "",
        apiKey: "", // Masked
      })
    } else {
      setSelectedProvider(null)
      setProviderForm({
        id: "",
        name: "",
        compatibilityMode: "GEMINI_NATIVE",
        apiUrl: "",
        apiKey: "",
      })
    }
    setActiveSheet("provider")
  }

  const handleSaveProvider = async () => {
    if (!providerForm.name) return

    if (selectedProvider) {
      await updateProvider.mutateAsync({
        id: providerForm.id,
        req: {
          id: providerForm.id,
          name: providerForm.name,
          apiUrl: providerForm.apiUrl,
          apiKey: providerForm.apiKey,
        },
      })
    } else {
      await createProvider.mutateAsync({
        name: providerForm.name,
        compatibilityMode: providerForm.compatibilityMode,
        apiUrl: providerForm.apiUrl,
        apiKey: providerForm.apiKey,
      })
    }
    setActiveSheet("none")
  }

  const handleDeleteProvider = async (id: string) => {
    if (confirm("Are you sure you want to delete this connection?")) {
      await deleteProvider.mutateAsync({ id, req: { id } })
    }
  }

  const currentBlueprint = providerCatalog?.blueprints.find(
    (b) => b.compatibilityMode === providerForm.compatibilityMode
  )

  return (
    <PageLayout
      title="LLM Connections"
      description="Configure connection channels, API keys, and endpoints for AI worker integrations."
      icon={Key}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border/20 pb-4">
          <p className="font-sans text-xs text-muted-foreground">
            Custom connection keys are secured and isolated from workspace
            default keys.
          </p>
          <Button
            size="sm"
            onClick={() => openProviderSheet(null)}
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.02] hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
        </div>

        <div className="grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
          {providersData?.providers.map((p) => (
            <Card
              key={p.id}
              className="border border-border/40 bg-card/45 backdrop-blur-xl transition-all duration-300 hover:border-primary/25 hover:shadow-xl"
            >
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                      <Key className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-xs leading-tight font-extrabold text-foreground">
                        {p.name}
                      </h4>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                        {p.apiUrl || "Default Cloud Gateway"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[9px] font-extrabold text-primary select-none">
                    {providerCatalog?.blueprints.find(
                      (b) => b.compatibilityMode === p.compatibilityMode
                    )?.displayName || p.compatibilityMode.replace("_", " ")}
                  </span>
                </div>

                <div className="flex gap-2 border-t border-border/10 pt-3">
                  <Button
                    variant="default"
                    className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent text-xs font-semibold text-white shadow-md shadow-primary/15 transition-all hover:scale-[1.01] hover:opacity-95"
                    onClick={() => openProviderSheet(p)}
                  >
                    Edit Connection
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex h-9 w-9 items-center justify-center rounded-lg p-0"
                    onClick={() => handleDeleteProvider(p.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {providersData?.providers.length === 0 && (
            <div className="col-span-full rounded-3xl border border-dashed border-border/30 bg-card/10 px-4 py-14 text-center select-none">
              <Key className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
              <h4 className="text-sm font-bold text-foreground">
                No Connection Channels Linked
              </h4>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                Add a connection provider (Ollama, Gemini, OpenAI) to link with
                custom agents.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* LLM Provider Connection Sheet */}
      <Sheet
        open={activeSheet === "provider"}
        onOpenChange={() => setActiveSheet("none")}
      >
        <SheetContent className="no-scrollbar w-full overflow-y-auto rounded-none border-none bg-card/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-[600px] sm:rounded-l-3xl sm:border-l sm:border-border/30">
          <SheetHeader className="border-b border-border/20 pb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Key className="h-5 w-5" />
              </div>
              <div className="text-left">
                <SheetTitle className="text-lg font-bold text-foreground">
                  {selectedProvider
                    ? "Update Provider Key"
                    : "Register Connection Provider"}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Link credentials and proxy endpoints for custom LLM models.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6 px-6 pb-6">
            <div className="space-y-2">
              <Label htmlFor="p-name">Connection Name</Label>
              <Input
                id="p-name"
                placeholder="e.g. Workspace Gemini Gateway"
                className="h-11 rounded-xl border-border/60 bg-background/50"
                value={providerForm.name}
                onChange={(e) =>
                  setProviderForm({ ...providerForm, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>API Compatibility Mode</Label>
              <Select
                value={providerForm.compatibilityMode}
                onValueChange={(val) =>
                  setProviderForm({
                    ...providerForm,
                    compatibilityMode: val || "",
                  })
                }
                disabled={!!selectedProvider}
              >
                <SelectTrigger className="!h-11 w-full rounded-xl border-border/60 bg-background/50">
                  <SelectValue placeholder="Select compatibility mode...">
                    {currentBlueprint
                      ? currentBlueprint.displayName
                      : "Select compatibility mode..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border/50 bg-card/90 shadow-xl backdrop-blur-xl">
                  {providerCatalog?.blueprints.map((b) => (
                    <SelectItem
                      key={b.id || ""}
                      value={b.compatibilityMode || ""}
                    >
                      {b.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-url">Custom API Base URL (Optional)</Label>
              <Input
                id="p-url"
                placeholder="e.g. http://10.0.0.50:11434"
                className="h-11 rounded-xl border-border/60 bg-background/50"
                value={providerForm.apiUrl}
                onChange={(e) =>
                  setProviderForm({ ...providerForm, apiUrl: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-key">API Key / Auth Token (Required)</Label>
              <Input
                id="p-key"
                type="password"
                placeholder={
                  selectedProvider
                    ? "•••••••••••• (Unchanged)"
                    : "Enter API authentication key"
                }
                className="h-11 rounded-xl border-border/60 bg-background/50"
                value={providerForm.apiKey}
                onChange={(e) =>
                  setProviderForm({ ...providerForm, apiKey: e.target.value })
                }
              />
            </div>

            <div className="border-t border-border/10 pt-6">
              <Button
                onClick={handleSaveProvider}
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.01] hover:opacity-95"
              >
                Save Connection
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </PageLayout>
  )
}
