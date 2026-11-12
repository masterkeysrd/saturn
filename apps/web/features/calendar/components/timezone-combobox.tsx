import { useState, useMemo } from "react"
import { Globe, Check, ChevronsUpDown, Search } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { COMMON_TIMEZONES } from "@saturn/schemas"
import { cn } from "@/lib/utils"

export interface TimezoneComboboxProps {
  value: string
  onChange: (tz: string) => void
  disabled?: boolean
  className?: string
}

export function TimezoneCombobox({
  value,
  onChange,
  disabled,
  className,
}: TimezoneComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filteredTimezones = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/\s+/g, "_")
    if (!q) return COMMON_TIMEZONES

    return COMMON_TIMEZONES.filter((tz) => {
      const lower = tz.toLowerCase()
      return lower.includes(q)
    })
  }, [search])

  const displayLabel = value || "Select timezone"

  return (
    <div className={cn("relative w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              id="timezone-select"
              data-testid="timezone-select"
              disabled={disabled}
              className={cn(
                "flex h-9 w-full items-center justify-between rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm shadow-xs transition hover:bg-input/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                className
              )}
            >
              <div className="flex min-w-0 items-center gap-2 truncate">
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{displayLabel}</span>
              </div>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </button>
          }
        />

        <PopoverContent
          className="z-50 w-[280px] rounded-xl border border-border/60 bg-popover p-2 shadow-lg sm:w-[320px]"
          align="start"
        >
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search timezones..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
                autoFocus
              />
            </div>

            <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
              {filteredTimezones.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No matching timezones found.
                </div>
              ) : (
                filteredTimezones.map((tz) => {
                  const isSelected = tz === value
                  return (
                    <button
                      key={tz}
                      type="button"
                      data-testid={`timezone-option-${tz}`}
                      onClick={() => {
                        onChange(tz)
                        setOpen(false)
                        setSearch("")
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition",
                        isSelected
                          ? "bg-primary font-semibold text-primary-foreground"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <span className="truncate">{tz}</span>
                      {isSelected && (
                        <Check className="ml-1.5 h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <input type="hidden" data-testid="timezone-hidden-input" value={value} />
    </div>
  )
}
