import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useI18n } from "@saturn/hooks"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  resolveInstitution,
  useCreateInstitutionMutation,
  type Institution,
  type ResolveInstitutionResponse,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { getInstitutionLogoUrl, BUDGET_COLORS } from "../utils"
import { Landmark, Loader2, Globe, Building2, Check } from "lucide-react"

interface CreateInstitutionModalProps {
  isOpen: boolean
  onClose: () => void
  initialName?: string
  onCreated: (institution: Institution) => void
}

export function CreateInstitutionModal({
  isOpen,
  onClose,
  initialName = "",
  onCreated,
}: CreateInstitutionModalProps) {
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const createMutation = useCreateInstitutionMutation()

  const [name, setName] = useState(initialName)
  const [domain, setDomain] = useState("")
  const [color, setColor] = useState("indigo")
  const [isResolving, setIsResolving] = useState(false)
  const [imgError, setImgError] = useState(false)

  const [prevIsOpen, setPrevIsOpen] = useState(false)
  const [prevInitialName, setPrevInitialName] = useState("")

  if (isOpen && (!prevIsOpen || prevInitialName !== initialName)) {
    setPrevIsOpen(true)
    setPrevInitialName(initialName)
    setName(initialName)
    setImgError(false)
    if (initialName.trim()) {
      setIsResolving(true)
    } else {
      setDomain("")
      setIsResolving(false)
    }
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false)
  }

  useEffect(() => {
    if (!isOpen || !initialName.trim()) return

    let canceled = false
    resolveInstitution({ name: initialName.trim() })
      .then((res: ResolveInstitutionResponse) => {
        if (canceled) return
        setDomain(res.domain || "")
        if (res.color) setColor(res.color)
      })
      .catch(() => {})
      .finally(() => {
        if (!canceled) setIsResolving(false)
      })

    return () => {
      canceled = true
    }
  }, [isOpen, initialName])

  const logoUrl = getInstitutionLogoUrl(domain, name)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!name.trim()) return

    try {
      const created = await createMutation.mutateAsync({
        institution: {
          id: "",
          name: name.trim(),
          domain: domain.trim(),
          logoUrl: logoUrl,
          color: color,
        },
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/institutions"],
      })
      onCreated(created)
      onClose()
    } catch (err) {
      console.error("Failed to create institution:", err)
    }
  }

  const isSubmitting = createMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Building2 className="h-4.5 w-4.5 text-primary" />
            <span>{t("finance.accounts.institution.modalTitle")}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t("finance.accounts.institution.modalDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Logo & Domain Preview Card */}
          <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-muted/20 p-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-card shadow-sm">
              {isResolving ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : logoUrl && !imgError ? (
                <img
                  src={logoUrl}
                  alt={name}
                  className="h-9 w-9 object-contain"
                  onError={() => setImgError(true)}
                />
              ) : (
                <Landmark className="h-7 w-7 text-indigo-500" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="truncate text-sm font-semibold">
                {name || t("finance.accounts.institution.nameFallback")}
              </h4>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                {domain || t("finance.accounts.institution.noDomain")}
              </p>
            </div>
          </div>

          {/* Name Field */}
          <div className="space-y-1.5">
            <Label
              htmlFor="inst-name"
              className="text-[13px] font-medium text-foreground/90"
            >
              {t("finance.accounts.institution.nameLabel")}
            </Label>
            <Input
              id="inst-name"
              placeholder={t("finance.accounts.institution.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Domain Field */}
          <div className="space-y-1.5">
            <Label
              htmlFor="inst-domain"
              className="text-[13px] font-medium text-foreground/90"
            >
              {t("finance.accounts.institution.domainLabel")}
            </Label>
            <Input
              id="inst-domain"
              placeholder={t("finance.accounts.institution.domainPlaceholder")}
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value)
                setImgError(false)
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t("finance.accounts.institution.domainHint")}
            </p>
          </div>

          {/* Color Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">
              {t("finance.accounts.institution.colorLabel")}
            </Label>
            <div className="flex items-center gap-2">
              {BUDGET_COLORS.slice(0, 6).map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${c.bar} ${
                    color === c.value
                      ? "scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : "opacity-75 hover:opacity-100"
                  }`}
                >
                  {color === c.value && (
                    <Check className="h-3.5 w-3.5 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("finance.accounts.institution.saveSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
