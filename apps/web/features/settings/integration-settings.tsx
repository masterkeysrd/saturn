import { useState, useEffect, createElement } from "react"
import {
  useGetIntegrationQuery,
  useConfigureIntegrationMutation,
  useSimulateWebhookMutation,
  useListCatalogQuery,
  useListIntegrationsQuery,
  useCreateIntegrationTokenMutation,
  useListIntegrationTokensQuery,
  useDeleteIntegrationTokenMutation,
} from "@/gen/saturn/platform/integration/v1/integration"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Mail,
  Plus,
  Trash2,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  Copy,
  Check,
  Terminal,
  CreditCard,
  Sliders,
  MessageSquare,
  ArrowRight,
} from "lucide-react"

interface SandboxTemplate {
  name: string
  sender: string
  subject: string
  body: string
}

const SANDBOX_TEMPLATES: SandboxTemplate[] = [
  {
    name: "Chase Transaction ($45.00)",
    sender: "alerts@chase.com",
    subject: "Chase Credit Card Alert: USD 45.00 charged at Netflix",
    body: "Chase Transaction Alert:\nAccount ending in *1234\nAmount: USD 45.00\nMerchant: Netflix.com\nTime: 2026-07-23T20:00:00Z",
  },
  {
    name: "Stripe Invoice ($120.00)",
    sender: "receipts@stripe.com",
    subject: "Your receipt for invoice #1029",
    body: "Stripe Receipt\nReceipt Number: 1029-9831\nAmount Paid: USD 120.00\nPayment Method: Card ending *9912\nVendor: AWS Cloud Services",
  },
  {
    name: "Netflix Subscription ($15.49)",
    sender: "info@netflix.com",
    subject: "Your Netflix Receipt: USD 15.49",
    body: "Netflix Subscription Invoice\nPlan: Standard Streaming\nAmount: USD 15.49\nPaid via Credit Card ending in *4321",
  },
]

const getIcon = (iconName: string) => {
  switch (iconName.toLowerCase()) {
    case "mail":
      return Mail
    case "credit-card":
      return CreditCard
    case "sliders":
      return Sliders
    case "message-square":
      return MessageSquare
    default:
      return Sliders
  }
}

const getIconBg = (iconName: string) => {
  switch (iconName.toLowerCase()) {
    case "mail":
      return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
    case "credit-card":
      return "bg-violet-500/10 text-violet-400 border-violet-500/20"
    case "sliders":
      return "bg-teal-500/10 text-teal-400 border-teal-500/20"
    case "message-square":
      return "bg-pink-500/10 text-pink-400 border-pink-500/20"
    default:
      return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
  }
}

export function IntegrationSettings() {
  // Catalog and Active Integrations Queries
  const { data: catalogData, isLoading: isCatalogLoading } =
    useListCatalogQuery({})
  const {
    data: integrationsData,
    isLoading: isIntegrationsLoading,
    refetch: refetchIntegrations,
  } = useListIntegrationsQuery({})

  // Configure Overlay Navigation
  const [activeSelection, setActiveSelection] = useState<{
    provider: string
    kind: string
  } | null>(null)

  const activeProviderId = activeSelection?.provider || null
  const activeKind = activeSelection?.kind || null

  // Detail Configuration Query (Only active when a provider is selected)
  const { data: detailData, refetch: refetchDetail } = useGetIntegrationQuery(
    { provider: activeProviderId || "", kind: activeKind || "" },
    { enabled: !!activeSelection, retry: false }
  )

  const configureMutation = useConfigureIntegrationMutation()
  const simulateMutation = useSimulateWebhookMutation()

  const integration = detailData

  // Token Management states
  const [newTokenName, setNewTokenName] = useState("")
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(
    null
  )
  const [newlyCreatedTokenName, setNewlyCreatedTokenName] = useState("")
  const [tokenCopied, setTokenCopied] = useState(false)

  // Fetch active tokens for the selected provider & kind
  const { data: tokensData, refetch: refetchTokens } =
    useListIntegrationTokensQuery(
      { provider: activeProviderId || "", kind: activeKind || "" },
      { enabled: !!activeSelection }
    )

  const createTokenMutation = useCreateIntegrationTokenMutation()
  const deleteTokenMutation = useDeleteIntegrationTokenMutation()

  // Whitelisted Senders state
  const [newSender, setNewSender] = useState("")
  const [allowedSenders, setAllowedSenders] = useState<string[]>([])

  // PDF Passwords state
  const [newPassword, setNewPassword] = useState("")
  const [pdfPasswords, setPdfPasswords] = useState<string[]>([])

  // Sandbox Form State
  const [sandboxSender, setSandboxSender] = useState("alerts@chase.com")
  const [sandboxSubject, setSandboxSubject] = useState(
    "Chase Credit Card Alert: USD 45.00 charged at Netflix"
  )
  const [sandboxBody, setSandboxBody] = useState(
    "Chase Transaction Alert:\nAccount ending in *1234\nAmount: USD 45.00\nMerchant: Netflix.com\nTime: 2026-07-23T20:00:00Z"
  )

  // Generic Webhook Payload State
  const [genericHeaders, setGenericHeaders] = useState<string>(
    '{\n  "Content-Type": "application/json"\n}'
  )
  const [genericPayload, setGenericPayload] = useState<string>(
    '{\n  "event": "transaction.created",\n  "amount": 4500,\n  "currency": "USD"\n}'
  )

  const [simulationResult, setSimulationResult] = useState<any | null>(null)

  // Sync config parameters from selected integration record
  useEffect(() => {
    if (integration?.configJson) {
      try {
        const parsed = JSON.parse(integration.configJson)
        if (Array.isArray(parsed.allowed_senders)) {
          setTimeout(() => {
            setAllowedSenders(parsed.allowed_senders)
          }, 0)
        } else {
          setTimeout(() => {
            setAllowedSenders([])
          }, 0)
        }
        if (Array.isArray(parsed.pdf_passwords)) {
          setTimeout(() => {
            setPdfPasswords(parsed.pdf_passwords)
          }, 0)
        } else {
          setTimeout(() => {
            setPdfPasswords([])
          }, 0)
        }
      } catch (err) {
        console.error("Failed to parse configJson", err)
      }
    } else {
      setTimeout(() => {
        setAllowedSenders([])
        setPdfPasswords([])
      }, 0)
    }
  }, [integration])

  // Lookup active descriptor
  const activeDescriptor = catalogData?.catalog?.find(
    (desc) => desc.provider === activeProviderId && desc.kind === activeKind
  )

  useEffect(() => {
    if (activeDescriptor) {
      if (activeDescriptor.samplePayload) {
        setTimeout(() => {
          setGenericPayload(activeDescriptor.samplePayload)
          try {
            const parsed = JSON.parse(activeDescriptor.samplePayload)
            if (parsed.sender) setSandboxSender(parsed.sender)
            if (parsed.subject) setSandboxSubject(parsed.subject)
            if (parsed.body) setSandboxBody(parsed.body)
          } catch {
            // ignore parsing error if it is not structured as email JSON
          }
        }, 0)
      }
    }
  }, [activeDescriptor])
  const isMailIntegration = activeDescriptor?.icon?.toLowerCase() === "mail"

  // Create / Update Ingestion
  const handleEnable = async () => {
    if (!activeProviderId || !activeDescriptor) return
    try {
      const res = await configureMutation.mutateAsync({
        provider: activeProviderId,
        kind: activeDescriptor.kind,
        configJson: JSON.stringify({ allowed_senders: [] }),
        isEnabled: true,
      })
      if (res.token) {
        setNewlyCreatedToken(res.token)
        setNewlyCreatedTokenName("Default Key")
      }
      refetchDetail()
      refetchIntegrations()
      refetchTokens()
    } catch (err) {
      console.error("Enable integration failed", err)
    }
  }

  const handleCreateToken = async () => {
    const name = newTokenName.trim()
    if (!name || !activeProviderId) return
    try {
      const res = await createTokenMutation.mutateAsync({
        provider: activeProviderId,
        req: { provider: activeProviderId, name, kind: activeKind || "" },
      })
      setNewlyCreatedToken(res.rawToken || null)
      setNewlyCreatedTokenName(name)
      setNewTokenName("")
      refetchTokens()
    } catch (err) {
      console.error("Failed to create token", err)
    }
  }

  const handleDeleteToken = async (id: string) => {
    if (!activeProviderId) return
    if (
      !confirm(
        "Are you sure you want to revoke this integration key? Any forwarder using this key will stop working immediately."
      )
    ) {
      return
    }
    try {
      await deleteTokenMutation.mutateAsync({
        provider: activeProviderId,
        id,
        req: { provider: activeProviderId, id, kind: activeKind || "" },
      })
      refetchTokens()
    } catch (err) {
      console.error("Failed to delete token", err)
    }
  }

  const handleSaveConfig = async (
    updatedSenders: string[],
    updatedPasswords: string[]
  ) => {
    if (!activeProviderId || !activeDescriptor) return
    try {
      await configureMutation.mutateAsync({
        provider: activeProviderId,
        kind: activeDescriptor.kind,
        configJson: JSON.stringify({
          allowed_senders: updatedSenders,
          pdf_passwords: updatedPasswords,
        }),
        isEnabled: true,
      })
      refetchDetail()
      refetchIntegrations()
    } catch (err) {
      console.error("Failed to save integration config", err)
    }
  }

  const handleAddSender = () => {
    const trimmed = newSender.trim().toLowerCase()
    if (!trimmed || allowedSenders.includes(trimmed)) return
    const list = [...allowedSenders, trimmed]
    setAllowedSenders(list)
    handleSaveConfig(list, pdfPasswords)
    setNewSender("")
  }

  const handleDeleteSender = (sender: string) => {
    const list = allowedSenders.filter((x) => x !== sender)
    setAllowedSenders(list)
    handleSaveConfig(list, pdfPasswords)
  }

  const handleAddPassword = () => {
    const trimmed = newPassword.trim()
    if (!trimmed || pdfPasswords.includes(trimmed)) return
    const list = [...pdfPasswords, trimmed]
    setPdfPasswords(list)
    handleSaveConfig(allowedSenders, list)
    setNewPassword("")
  }

  const handleDeletePassword = (pw: string) => {
    const list = pdfPasswords.filter((x) => x !== pw)
    setPdfPasswords(list)
    handleSaveConfig(allowedSenders, list)
  }

  const handleSimulate = async () => {
    if (!activeProviderId) return
    setSimulationResult(null)

    let headersObj: Record<string, string>
    let finalPayload: string

    if (isMailIntegration) {
      headersObj = { "Content-Type": "application/json" }
      finalPayload = JSON.stringify({
        sender: sandboxSender,
        subject: sandboxSubject,
        body: sandboxBody,
      })
    } else {
      try {
        headersObj = JSON.parse(genericHeaders)
      } catch (err) {
        console.error("Failed to parse genericHeaders JSON", err)
        alert("Invalid JSON in headers field")
        return
      }
      finalPayload = genericPayload
    }

    try {
      const res = await simulateMutation.mutateAsync({
        provider: activeProviderId,
        req: {
          provider: activeProviderId,
          headers: headersObj,
          payload: finalPayload,
          kind: activeKind || "",
        },
      })
      setSimulationResult(res.result || null)
    } catch (err) {
      console.error("Simulation failed", err)
    }
  }

  if (isCatalogLoading || isIntegrationsLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="text-xs text-muted-foreground">
          Loading integrations...
        </span>
      </div>
    )
  }

  const catalog = catalogData?.catalog || []
  const integrations = integrationsData?.integrations || []

  const isSenderWhitelisted = allowedSenders
    .map((s) => s.toLowerCase())
    .includes(sandboxSender.trim().toLowerCase())

  // Dynamically map active catalog from backend
  const integrationsList = catalog.map((desc) => {
    const activeConfig = integrations.find(
      (i) => i.provider === desc.provider && i.kind === desc.kind
    )
    return {
      id: desc.provider + ":" + desc.kind,
      provider: desc.provider,
      kind: desc.kind,
      name: desc.name,
      description: desc.description,
      status: activeConfig?.isEnabled ? "Enabled" : "Disabled",
      badgeColor: activeConfig?.isEnabled
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
      icon: getIcon(desc.icon),
      iconBg: getIconBg(desc.icon),
      actionLabel: "Configure",
      available: true,
      schema: desc.configSchema,
    }
  })

  return (
    <div className="space-y-8 py-2">
      {/* Header introduction */}
      <div className="rounded-3xl border border-border/30 bg-card/10 p-6 backdrop-blur-xl">
        <h3 className="text-base font-bold text-foreground">
          Integrations Marketplace
        </h3>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
          Enhance your Saturn workspace. Connect third-party endpoints to
          automatically ingest transactions, synchronize bank records, and
          forward alerts.
        </p>
      </div>

      {/* Main Grid Directory (Only lists actual catalog from backend) */}
      {integrationsList.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/30 bg-card/10 px-4 py-14 text-center select-none">
          <Sliders className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
          <h4 className="text-sm font-bold text-foreground">
            No Integrations Registered
          </h4>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            There are currently no active provider modules configured in the
            backend integrations registry.
          </p>
        </div>
      ) : (
        <div className="grid animate-in grid-cols-1 gap-6 duration-300 fade-in md:grid-cols-2">
          {integrationsList.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 shadow-md backdrop-blur-xl transition-all duration-300 hover:border-indigo-500/25 hover:shadow-xl"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${item.iconBg}`}
                  >
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span
                    className={`rounded-xl border px-2.5 py-1 text-[10px] font-extrabold select-none ${item.badgeColor}`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-foreground transition-colors group-hover:text-indigo-400">
                    {item.name}
                  </h4>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-border/10 pt-4">
                <Button
                  variant="default"
                  className="w-full cursor-pointer rounded-2xl bg-indigo-500 font-semibold text-white shadow-md hover:bg-indigo-600"
                  onClick={() =>
                    setActiveSelection({
                      provider: item.provider,
                      kind: item.kind,
                    })
                  }
                >
                  {item.actionLabel}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sliding Configuration Panel */}
      <Sheet
        open={!!activeSelection}
        onOpenChange={(open) => !open && setActiveSelection(null)}
      >
        <SheetContent className="no-scrollbar w-full overflow-y-auto rounded-l-3xl border-l border-border/30 bg-card/95 p-6 shadow-2xl backdrop-blur-2xl data-[side=right]:sm:max-w-[950px]">
          <SheetHeader className="border-b border-border/20 pb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
                {activeDescriptor ? (
                  createElement(getIcon(activeDescriptor.icon), {
                    className: "w-5 h-5",
                  })
                ) : (
                  <Mail className="h-5 w-5" />
                )}
              </div>
              <div className="text-left">
                <SheetTitle className="text-lg font-bold text-foreground">
                  {activeDescriptor?.name || "Configure Integration"}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Configure inbound routes, whitelist filters, and simulator
                  sandboxes.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-8 py-6">
            {/* Enable toggle or display token configuration */}
            {!integration?.isEnabled ? (
              <div className="animate-in rounded-2xl border border-dashed border-border/40 bg-card/25 px-4 py-10 text-center fade-in">
                <h4 className="text-sm font-bold text-foreground">
                  Integration is Disabled
                </h4>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Configure this workspace to generate your active connection
                  token.
                </p>
                <Button
                  className="mt-6 cursor-pointer bg-indigo-500 font-semibold text-white shadow-md transition-all hover:bg-indigo-600"
                  onClick={handleEnable}
                  disabled={configureMutation.isPending}
                >
                  {configureMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Enable Connection Token
                </Button>
              </div>
            ) : (
              <div className="animate-in space-y-8 fade-in">
                {/* Inbound Integration Tokens list */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Inbound Integration Keys
                    </h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Generate and manage cryptographically secure keys to link
                      multiple inbound email forwarders or webhooks.
                    </p>
                  </div>

                  {/* Banner to display newly created raw token */}
                  {newlyCreatedToken && (
                    <div className="relative animate-in space-y-3 overflow-hidden rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 duration-300 slide-in-from-top-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-400">
                          New Key Generated:{" "}
                          <span className="text-foreground">
                            {newlyCreatedTokenName}
                          </span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => setNewlyCreatedToken(null)}
                        >
                          Dismiss
                        </Button>
                      </div>

                      <div className="relative">
                        <Input
                          readOnly
                          className="border-indigo-500/20 bg-background/40 pr-10 font-mono text-xs text-foreground select-all"
                          value={`alerts+${newlyCreatedToken}@inbound.saturn.com`}
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `alerts+${newlyCreatedToken}@inbound.saturn.com`
                            )
                            setTokenCopied(true)
                            setTimeout(() => setTokenCopied(false), 2000)
                          }}
                          type="button"
                          className="absolute top-2.5 right-3 text-muted-foreground transition-colors hover:text-indigo-400"
                          title="Copy address"
                        >
                          {tokenCopied ? (
                            <Check className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      <p className="flex items-start gap-1.5 rounded-xl border border-indigo-500/15 bg-indigo-500/10 p-3 text-[10px] leading-relaxed text-indigo-400/90">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                        <span>
                          <strong>Copy this address now.</strong> For security,
                          the full key is hidden after you dismiss this banner
                          or reload.
                        </span>
                      </p>
                    </div>
                  )}

                  {/* Create key input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Key Name (e.g. Cloudflare Worker B)"
                      className="bg-background/40 text-xs"
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateToken()
                      }}
                    />
                    <Button
                      className="shrink-0 cursor-pointer bg-indigo-500 font-semibold text-white hover:bg-indigo-600"
                      onClick={handleCreateToken}
                      disabled={
                        createTokenMutation.isPending || !newTokenName.trim()
                      }
                    >
                      {createTokenMutation.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-1 h-4 w-4" />
                      )}
                      Generate Key
                    </Button>
                  </div>

                  {/* List of tokens */}
                  {!tokensData?.tokens || tokensData.tokens.length === 0 ? (
                    <p className="rounded-xl bg-muted/10 p-3 text-center text-xs text-muted-foreground italic">
                      No active keys generated.
                    </p>
                  ) : (
                    <div className="no-scrollbar max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-border/10 bg-background/25 p-2 pr-1">
                      {tokensData.tokens.map((tok) => {
                        const maskedEmail = `alerts+${tok.tokenHash.substring(0, 8)}... @inbound.saturn.com`
                        return (
                          <div
                            key={tok.id}
                            className="flex items-center justify-between rounded-xl border border-border/20 bg-card/30 px-3 py-1.5 text-xs transition-colors hover:border-indigo-500/10"
                          >
                            <div className="space-y-0.5 text-left">
                              <span className="font-extrabold text-foreground">
                                {tok.name}
                              </span>
                              <span className="block font-mono text-[10px] text-muted-foreground">
                                {maskedEmail}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-red-400"
                                onClick={() => handleDeleteToken(tok.id)}
                                disabled={deleteTokenMutation.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Allowed Forwarding Whitelist (Dynamically rendered based on Schema) */}
                {activeDescriptor?.configSchema?.includes(
                  "allowed_senders"
                ) && (
                  <div className="space-y-4 border-t border-border/20 pt-6">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">
                        Whitelisted Sender Addresses
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Requests sent from unlisted addresses are immediately
                        blocked for database safety.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. alerts@chase.com"
                        className="bg-background/40 text-xs"
                        value={newSender}
                        onChange={(e) => setNewSender(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddSender()
                        }}
                      />
                      <Button
                        className="shrink-0 cursor-pointer bg-indigo-500 font-semibold text-white hover:bg-indigo-600"
                        onClick={handleAddSender}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add
                      </Button>
                    </div>

                    {allowedSenders.length === 0 ? (
                      <p className="rounded-xl bg-muted/10 p-3 text-center text-xs text-muted-foreground italic">
                        No whitelist rules active.
                      </p>
                    ) : (
                      <div className="no-scrollbar max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-border/10 bg-background/25 p-2 pr-1">
                        {allowedSenders.map((sender) => (
                          <div
                            key={sender}
                            className="flex items-center justify-between rounded-xl border border-border/20 bg-card/30 px-3 py-1.5 text-xs transition-colors hover:border-indigo-500/10"
                          >
                            <span className="font-mono text-muted-foreground">
                              {sender}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-red-400"
                              onClick={() => handleDeleteSender(sender)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* PDF Decryption Passwords (Dynamically rendered based on Schema) */}
                {activeDescriptor?.configSchema?.includes("pdf_passwords") && (
                  <div className="space-y-4 border-t border-border/20 pt-6">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">
                        PDF Decryption Passwords
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Passwords used to automatically decrypt statement
                        attachments (e.g. birth dates, tax IDs, pin codes).
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="e.g. your_pin_code"
                        className="bg-background/40 text-xs"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddPassword()
                        }}
                      />
                      <Button
                        className="shrink-0 cursor-pointer bg-indigo-500 font-semibold text-white hover:bg-indigo-600"
                        onClick={handleAddPassword}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add
                      </Button>
                    </div>

                    {pdfPasswords.length === 0 ? (
                      <p className="rounded-xl bg-muted/10 p-3 text-center text-xs text-muted-foreground italic">
                        No decryption passwords configured.
                      </p>
                    ) : (
                      <div className="no-scrollbar max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-border/10 bg-background/25 p-2 pr-1">
                        {pdfPasswords.map((pw) => (
                          <div
                            key={pw}
                            className="flex items-center justify-between rounded-xl border border-border/20 bg-card/30 px-3 py-1.5 text-xs transition-colors hover:border-indigo-500/10"
                          >
                            <span className="font-mono text-muted-foreground">
                              •••••••• (Length: {pw.length})
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-red-400"
                              onClick={() => handleDeletePassword(pw)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Ingestion Simulator Sandbox */}
                <div className="space-y-4 border-t border-border/20 pt-6">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4.5 w-4.5 text-indigo-400" />
                    <h4 className="text-sm font-bold text-foreground">
                      Ingestion Sandbox Simulator
                    </h4>
                  </div>

                  {/* Adaptive Form Panel */}
                  {isMailIntegration ? (
                    <div className="space-y-4">
                      {/* Mock Ingestion Templates */}
                      <div className="space-y-2 rounded-2xl border border-border/10 bg-background/20 p-3">
                        <Label className="block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                          Load Mock Sandbox Templates
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {SANDBOX_TEMPLATES.map((tmpl) => (
                            <button
                              key={tmpl.name}
                              onClick={() => {
                                setSandboxSender(tmpl.sender)
                                setSandboxSubject(tmpl.subject)
                                setSandboxBody(tmpl.body)
                              }}
                              type="button"
                              className="cursor-pointer rounded-full border border-border/60 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition-all duration-200 hover:border-indigo-500/40 hover:bg-indigo-500/5 hover:text-indigo-400"
                            >
                              {tmpl.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                            Sender Email (From)
                          </Label>
                          <Input
                            className="bg-background/40 text-xs"
                            value={sandboxSender}
                            onChange={(e) => setSandboxSender(e.target.value)}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                            Email Subject
                          </Label>
                          <Input
                            className="bg-background/40 text-xs"
                            value={sandboxSubject}
                            onChange={(e) => setSandboxSubject(e.target.value)}
                          />
                        </div>

                        {/* Whitelist Warning */}
                        {!isSenderWhitelisted && (
                          <div className="flex animate-in items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-500 duration-300 slide-in-from-top-2 sm:col-span-2">
                            <div className="flex items-center gap-1.5">
                              <AlertCircle className="h-4.5 w-4.5 shrink-0 text-amber-500" />
                              <span>
                                Sender is not whitelisted. Webhook will be
                                rejected.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const trimmed = sandboxSender
                                  .trim()
                                  .toLowerCase()
                                if (
                                  trimmed &&
                                  !allowedSenders.includes(trimmed)
                                ) {
                                  const updated = [...allowedSenders, trimmed]
                                  setAllowedSenders(updated)
                                  handleSaveConfig(updated, pdfPasswords)
                                }
                              }}
                              className="cursor-pointer rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500 transition-colors hover:bg-amber-500/20"
                            >
                              Whitelist Sender
                            </button>
                          </div>
                        )}

                        <div className="space-y-1.5 sm:col-span-2">
                          <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                            Receipt Email Plain Body Text
                          </Label>
                          <Textarea
                            className="min-h-[120px] bg-background/40 font-mono text-xs leading-relaxed"
                            value={sandboxBody}
                            onChange={(e) => setSandboxBody(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                            Headers (JSON map)
                          </Label>
                          <Textarea
                            className="min-h-[60px] bg-background/40 font-mono text-xs leading-relaxed"
                            value={genericHeaders}
                            onChange={(e) => setGenericHeaders(e.target.value)}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                            Raw Webhook Payload Body
                          </Label>
                          <Textarea
                            className="min-h-[120px] bg-background/40 font-mono text-xs leading-relaxed"
                            value={genericPayload}
                            onChange={(e) => setGenericPayload(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      className="cursor-pointer bg-indigo-500 font-semibold text-white shadow-md transition-transform hover:scale-[1.01] hover:bg-indigo-600"
                      onClick={handleSimulate}
                      disabled={simulateMutation.isPending}
                    >
                      {simulateMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Test Simulation
                    </Button>
                  </div>

                  {/* Simulation result */}
                  {simulationResult && (
                    <div className="animate-in space-y-3 overflow-hidden rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 duration-300 zoom-in-95">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
                        <CheckCircle className="h-4 w-4 text-indigo-400" />
                        Ingestion Simulation Success
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-3 border-t border-indigo-500/10 pt-3 text-[11px]">
                        <div>
                          <span className="block text-[9px] font-semibold text-muted-foreground uppercase">
                            Vendor
                          </span>
                          <span className="font-extrabold text-foreground">
                            {simulationResult.vendorName}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-semibold text-muted-foreground uppercase">
                            Amount
                          </span>
                          <span className="font-extrabold text-foreground">
                            {simulationResult.currency || "USD"}{" "}
                            {(Number(simulationResult.amount) / 100).toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-semibold text-muted-foreground uppercase">
                            Budget ID
                          </span>
                          <span className="font-mono text-[9px] text-muted-foreground">
                            {simulationResult.budgetId || "General"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-semibold text-muted-foreground uppercase">
                            Account ID
                          </span>
                          <span className="font-mono text-[9px] text-muted-foreground">
                            {simulationResult.accountId || "Manual"}
                          </span>
                        </div>
                      </div>

                      <p className="flex items-center gap-1 border-t border-indigo-500/10 pt-3 text-[10px] leading-relaxed text-indigo-400/80">
                        <Sparkles className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Staged successfully! Head to **Transactions** review
                          queue.
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
