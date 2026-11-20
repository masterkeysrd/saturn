import { useRef, useState } from "react"
import { insertVariableToken, type WorkflowVariable } from "@saturn/core"
import { useI18n } from "@saturn/hooks"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { Braces } from "lucide-react"

interface VariablePickerInputProps {
  value: string
  onChange: (next: string) => void
  variables: WorkflowVariable[]
  multiline?: boolean
  rows?: number
  placeholder?: string
  rawMode?: boolean
  className?: string
  ariaLabel?: string
}

export function VariablePickerInput({
  value,
  onChange,
  variables,
  multiline = false,
  rows = 3,
  placeholder,
  rawMode = false,
  className,
  ariaLabel,
}: VariablePickerInputProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const quickVars = variables
    .filter((v) => v.group !== "space" && v.group !== "run")
    .slice(0, 4)

  const filtered = variables.filter((v) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      v.path.toLowerCase().includes(q) ||
      v.label.toLowerCase().includes(q) ||
      v.group.toLowerCase().includes(q)
    )
  })

  const handleInsert = (variablePath: string) => {
    const el = multiline ? textareaRef.current : inputRef.current
    const selection =
      el && typeof el.selectionStart === "number"
        ? {
            start: el.selectionStart,
            end: el.selectionEnd ?? el.selectionStart,
          }
        : undefined

    const res = insertVariableToken(value, variablePath, selection, rawMode)
    onChange(res.value)
    setOpen(false)
    setSearch("")
    requestAnimationFrame(() => {
      if (el) {
        el.focus()
        el.setSelectionRange(res.cursor, res.cursor)
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="relative flex items-start gap-1.5">
        {multiline ? (
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            rows={rows}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={`flex-1 rounded-xl font-mono text-xs ${className ?? ""}`}
          />
        ) : (
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className={`h-9 flex-1 rounded-xl font-mono text-xs ${className ?? ""}`}
          />
        )}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="h-9 w-9 shrink-0 rounded-xl"
                title={t("workflows.variables.insert")}
                aria-label={t("workflows.variables.insert")}
              />
            }
          >
            <Braces className="h-3.5 w-3.5 text-primary" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 rounded-2xl p-2">
            <div className="space-y-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("workflows.variables.search")}
                className="h-8 rounded-lg text-xs"
              />
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {filtered.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {t("workflows.variables.empty")}
                  </p>
                ) : (
                  filtered.map((v) => (
                    <button
                      key={v.path}
                      type="button"
                      onClick={() => handleInsert(v.path)}
                      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono font-medium text-foreground">
                          {v.path}
                        </div>
                        {v.description && (
                          <div className="truncate text-[10px] text-muted-foreground">
                            {v.description}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                        {v.group}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {(focused || multiline) && quickVars.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {quickVars.map((v) => (
            <button
              key={v.path}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                handleInsert(v.path)
              }}
              className="cursor-pointer rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {rawMode ? v.path : `{{ ${v.path} }}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
