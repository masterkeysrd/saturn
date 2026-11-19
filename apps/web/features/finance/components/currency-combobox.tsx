import { useMemo, useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import {
  type CurrencyInfo,
  useListCurrenciesQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { getCurrencySymbol } from "@saturn/core"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"

const FALLBACK_CURRENCIES: CurrencyInfo[] = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "DOP", name: "Dominican Peso" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "COP", name: "Colombian Peso" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "AUD", name: "Australian Dollar" },
]

export interface CurrencyComboboxProps {
  id?: string
  value: string
  onValueChange: (currencyCode: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  "aria-label"?: string
}

export function CurrencyCombobox({
  id,
  value,
  onValueChange,
  disabled = false,
  placeholder = "Select currency...",
  className,
  "aria-label": ariaLabel,
}: CurrencyComboboxProps) {
  const [open, setOpen] = useState(false)

  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { staleTime: 1000 * 60 * 30 }
  )

  const items = useMemo(() => {
    const source =
      currenciesData?.currencies && currenciesData.currencies.length > 0
        ? currenciesData.currencies
        : FALLBACK_CURRENCIES

    return source.map((c) => ({
      code: c.code,
      name: c.name || c.code,
      symbol: getCurrencySymbol(c.code),
    }))
  }, [currenciesData?.currencies])

  const selected = useMemo(
    () =>
      items.find((item) => item.code === value) ??
      (value
        ? {
            code: value,
            name: value,
            symbol: getCurrencySymbol(value),
          }
        : null),
    [items, value]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-control px-3 text-left text-sm text-foreground shadow-2xs transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2 truncate">
            <span className="font-mono font-medium text-foreground">
              {selected.code}
            </span>
            <span className="text-muted-foreground">—</span>
            <span className="truncate text-foreground/90">
              {selected.name} ({selected.symbol})
            </span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-0 shadow-xl"
      >
        <Command>
          <CommandInput placeholder="Search code, name, or symbol..." />
          <CommandList>
            <CommandEmpty>No matching currency found.</CommandEmpty>
            <CommandGroup>
              {items.map((currency) => {
                const isSelected = currency.code === value
                return (
                  <CommandItem
                    key={currency.code}
                    value={`${currency.code} ${currency.name} ${currency.symbol}`}
                    data-checked={isSelected ? "true" : "false"}
                    onSelect={() => {
                      onValueChange(currency.code)
                      setOpen(false)
                    }}
                    className="cursor-pointer justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-10 shrink-0 font-mono text-xs font-medium text-foreground">
                        {currency.code}
                      </span>
                      <span className="truncate text-sm text-foreground/90">
                        {currency.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        ({currency.symbol})
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="size-4 shrink-0 text-primary opacity-100" />
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
