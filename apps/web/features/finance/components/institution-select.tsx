import { useState, useMemo } from "react"
import {
  useListInstitutionsQuery,
  type Institution,
} from "@/gen/saturn/finance/v1/finance"
import { getInstitutionLogoUrl } from "../utils"
import { CreateInstitutionModal } from "./create-institution-modal"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Landmark, Plus, Check, ChevronsUpDown, Building2 } from "lucide-react"

interface InstitutionSelectProps {
  value?: string
  onChange: (institutionId: string) => void
}

function InstitutionLogo({
  logoUrl,
  className = "h-6 w-6",
  iconClassName = "h-3.5 w-3.5",
}: {
  logoUrl: string
  className?: string
  iconClassName?: string
}) {
  const [prevLogoUrl, setPrevLogoUrl] = useState(logoUrl)
  const [failed, setFailed] = useState(false)

  if (prevLogoUrl !== logoUrl) {
    setPrevLogoUrl(logoUrl)
    setFailed(false)
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-card ${className}`}
    >
      {logoUrl && !failed ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain p-0.5"
          onError={() => setFailed(true)}
        />
      ) : (
        <Landmark className={`${iconClassName} text-muted-foreground`} />
      )}
    </div>
  )
}

export function InstitutionSelect({ value, onChange }: InstitutionSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createInitialName, setCreateInitialName] = useState("")
  const [createdInst, setCreatedInst] = useState<Institution | null>(null)

  const { data: instData } = useListInstitutionsQuery({
    pageSize: 100,
    pageToken: "",
  })

  const savedInstitutions = useMemo(
    () => instData?.institutions || [],
    [instData?.institutions]
  )

  const selectedInstitution = useMemo(() => {
    if (!value) return null
    return (
      savedInstitutions.find((i: Institution) => i.id === value) ||
      (createdInst?.id === value ? createdInst : null)
    )
  }, [savedInstitutions, value, createdInst])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return savedInstitutions

    return savedInstitutions.filter(
      (i: Institution) =>
        (i.name || "").toLowerCase().includes(q) ||
        (i.domain && i.domain.toLowerCase().includes(q))
    )
  }, [savedInstitutions, search])

  const showCreateOption = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return false
    return !savedInstitutions.some(
      (i: Institution) => (i.name || "").toLowerCase() === q
    )
  }, [savedInstitutions, search])

  const handleSelect = (instId: string) => {
    onChange(instId)
    setOpen(false)
    setSearch("")
  }

  const handleStartCreate = (nameToCreate: string) => {
    setCreateInitialName(nameToCreate)
    setOpen(false)
    setCreateModalOpen(true)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="flex h-10 w-full items-center justify-between rounded-md border border-border/50 bg-card/50 px-3 text-left font-normal hover:bg-accent/50">
          {selectedInstitution ? (
            <div className="flex items-center gap-2.5 truncate">
              <InstitutionLogo
                logoUrl={getInstitutionLogoUrl(
                  selectedInstitution.domain,
                  selectedInstitution.name
                )}
                className="h-6 w-6"
                iconClassName="h-3.5 w-3.5"
              />
              <span className="truncate text-sm font-medium">
                {selectedInstitution.name}
              </span>
            </div>
          ) : (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4 text-muted-foreground/70" />
              Select or type institution...
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </PopoverTrigger>

        <PopoverContent
          className="w-[320px] border-border/40 bg-background/95 p-2 shadow-xl backdrop-blur-xl"
          align="start"
        >
          <div className="space-y-2">
            <Input
              placeholder="Search or type new bank..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 bg-muted/40 text-xs"
              autoFocus
            />

            <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
              {filteredItems.map((inst: Institution) => {
                const logoUrl = getInstitutionLogoUrl(inst.domain, inst.name)
                const instId = inst.id || ""
                const isSelected = instId === value
                return (
                  <button
                    key={instId}
                    type="button"
                    onClick={() => handleSelect(instId)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                      isSelected
                        ? "bg-indigo-500/10 font-medium text-indigo-500"
                        : "text-foreground hover:bg-accent/60"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <InstitutionLogo
                        logoUrl={logoUrl}
                        className="h-6 w-6"
                        iconClassName="h-3 w-3"
                      />
                      <div className="truncate text-left">
                        <div className="truncate font-medium">{inst.name}</div>
                        {inst.domain && (
                          <div className="truncate text-[10px] text-muted-foreground">
                            {inst.domain}
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    )}
                  </button>
                )
              })}

              {/* Action item: Create new institution */}
              {showCreateOption && (
                <button
                  type="button"
                  onClick={() => handleStartCreate(search.trim())}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-indigo-500/30 px-2.5 py-2 text-xs font-semibold text-indigo-500 transition-colors hover:bg-indigo-500/10"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="truncate">Create "{search.trim()}"</span>
                </button>
              )}

              {filteredItems.length === 0 && !showCreateOption && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No institutions found
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <CreateInstitutionModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        initialName={createInitialName}
        onCreated={(inst) => {
          setCreatedInst(inst)
          onChange(inst.id || "")
        }}
      />
    </>
  )
}
