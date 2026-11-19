import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCreateProviderMutation,
  useListProviderDescriptorsQuery,
  useUpdateProviderMutation,
  type Provider,
  type ProviderDescriptor,
} from "@saturn/api/saturn/platform/ai/v1/ai"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ProviderLogo } from "./provider-logo"
import { ChevronDownIcon } from "lucide-react"

interface ProviderSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider?: Provider | null
}

function ProviderSheetForm({
  provider,
  descriptors,
  onClose,
}: {
  provider?: Provider | null
  descriptors: ProviderDescriptor[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(provider?.id)
  const defaultDesc = descriptors[0]

  const [driver, setDriver] = useState(
    provider?.driver || defaultDesc?.driver || "gemini"
  )
  const [name, setName] = useState(
    provider?.name ?? defaultDesc?.displayName ?? "Google Gemini"
  )
  const [baseUrl, setBaseUrl] = useState(provider?.config?.baseUrl ?? "")
  const [apiKey, setApiKey] = useState("")
  const [isEnabled, setIsEnabled] = useState(
    provider ? provider.isEnabled : true
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const activeDesc = descriptors.find((d) => d.driver === driver)

  const invalidateAI = () => {
    void queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/ai/providers"],
    })
    void queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/ai/models"],
    })
    void queryClient.invalidateQueries({
      queryKey: ["/api/v1/platform/ai/settings"],
    })
  }

  const createProvider = useCreateProviderMutation({
    onSuccess: () => {
      invalidateAI()
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const updateProvider = useUpdateProviderMutation({
    onSuccess: () => {
      invalidateAI()
      onClose()
    },
    onError: (err) => setErrorMsg(err.message),
  })

  const handleDriverChange = (nextDriver: string | null) => {
    const d = nextDriver ?? "gemini"
    setDriver(d)
    if (!isEditing) {
      const found = descriptors.find((item) => item.driver === d)
      if (found) {
        setName(found.displayName ?? d)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    const payload: Provider = {
      id: provider?.id ?? "",
      spaceId: provider?.spaceId ?? "",
      name: name.trim(),
      driver,
      hasSecret: provider?.hasSecret ?? false,
      isEnabled,
      modelCount: provider?.modelCount ?? 0,
      config: baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {},
      ...(apiKey.trim() && {
        secret: { apiKey: apiKey.trim(), headers: {} },
      }),
    }

    if (isEditing && provider?.id) {
      const paths = ["name", "is_enabled", "config.base_url"]
      if (apiKey.trim()) {
        paths.push("secret.api_key")
      }
      updateProvider.mutate({
        id: provider.id,
        req: {
          id: provider.id,
          provider: payload,
          updateMask: { paths },
        },
      })
    } else {
      createProvider.mutate({ provider: payload })
    }
  }

  const isPending = createProvider.isPending || updateProvider.isPending

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {errorMsg && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Provider Driver</Label>
          <Select
            value={driver}
            onValueChange={handleDriverChange}
            disabled={isEditing}
          >
            <SelectTrigger>
              <SelectValue>
                <span className="flex items-center gap-2">
                  <ProviderLogo driver={driver} />
                  <span>{activeDesc?.displayName || driver}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {descriptors.map((d) => (
                <SelectItem key={d.driver} value={d.driver ?? ""}>
                  <span className="flex items-center gap-2">
                    <ProviderLogo driver={d.driver} />
                    <span>{d.displayName}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeDesc?.description && (
            <p className="text-[11px] text-muted-foreground">
              {activeDesc.description}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prov-name">Display Name *</Label>
          <Input
            id="prov-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Production OpenAI"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prov-key">
            API Key{" "}
            {!isEditing && activeDesc?.apiKeyRequired !== false ? "*" : ""}
          </Label>
          <Input
            id="prov-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required={
              !isEditing &&
              driver !== "ollama" &&
              driver !== "openai_compatible"
            }
            placeholder={
              isEditing && provider?.hasSecret
                ? "Leave blank to keep stored secret"
                : "sk-..."
            }
          />
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-4">
          <div>
            <Label htmlFor="prov-enabled">Enabled</Label>
            <p className="text-[11px] text-muted-foreground">
              Allow models from this provider to be invoked
            </p>
          </div>
          <Switch
            id="prov-enabled"
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
          />
        </div>

        <Collapsible
          open={
            advancedOpen ||
            driver === "openai_compatible" ||
            driver === "ollama"
          }
          onOpenChange={setAdvancedOpen}
          className="border-t border-border/40 pt-4"
        >
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground">
            <span>Advanced</span>
            <ChevronDownIcon
              className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="prov-baseurl">
                Base URL{" "}
                {driver === "openai_compatible" ? "*" : "(Optional override)"}
              </Label>
              <Input
                id="prov-baseurl"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required={driver === "openai_compatible"}
                placeholder={
                  activeDesc?.defaultBaseUrl || "https://api.example.com/v1"
                }
                className="font-mono text-xs"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <DialogFooter className="shrink-0 border-t border-border/60 bg-card px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving..."
            : isEditing
              ? "Save Changes"
              : "Connect Provider"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ProviderSheet({
  open,
  onOpenChange,
  provider,
}: ProviderSheetProps) {
  const { data: descData } = useListProviderDescriptorsQuery({})
  const descriptors = descData?.providers ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88svh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base font-semibold">
            <ProviderLogo driver={provider?.driver ?? "gemini"} />
            {provider?.id ? `Edit ${provider.name}` : "Connect LLM Provider"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Credentials are encrypted at rest and curated models are auto-seeded
            on creation.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ProviderSheetForm
            key={provider?.id ?? "new"}
            provider={provider}
            descriptors={descriptors}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
