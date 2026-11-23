import { API_KEY_SCOPE_GROUPS, type APIKeyScope } from "@saturn/schemas"
import { useI18n } from "@saturn/hooks"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import {
  getScopeDescription,
  getScopeGroupLabel,
  getScopeLabel,
} from "@/lib/scopes"

export interface ScopePickerProps {
  selectedScopes: string[]
  onToggleScope: (scope: string) => void
  /** When provided, renders a flat list of only these scopes (e.g., OAuth consent). Otherwise renders all canonical grouped scopes. */
  scopes?: string[]
  showDescriptions?: boolean
  disabled?: boolean
  className?: string
}

export function ScopePicker({
  selectedScopes,
  onToggleScope,
  scopes,
  showDescriptions = true,
  disabled = false,
  className,
}: ScopePickerProps) {
  const { t } = useI18n()

  if (scopes) {
    return (
      <div className={cn("space-y-2", className)}>
        {scopes.map((s) => {
          const label = getScopeLabel(t, s)
          const desc = showDescriptions ? getScopeDescription(t, s) : null
          const checked = selectedScopes.includes(s)
          return (
            <label
              key={s}
              className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/40"
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                onCheckedChange={() => onToggleScope(s)}
                aria-label={label}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {label}
                  </span>
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {s}
                  </code>
                </div>
                {desc && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {desc}
                  </p>
                )}
              </div>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {API_KEY_SCOPE_GROUPS.map((group) => (
        <div key={group.id} className="space-y-1.5">
          <div className="text-xs font-semibold text-foreground">
            {getScopeGroupLabel(t, group.id)}
          </div>
          <div className="space-y-1.5 pl-1">
            {group.scopes.map((meta) => {
              const label = getScopeLabel(t, meta.scope)
              const desc = showDescriptions
                ? getScopeDescription(t, meta.scope)
                : null
              const checked = selectedScopes.includes(meta.scope)
              return (
                <label
                  key={meta.scope}
                  className="flex cursor-pointer items-start gap-2.5"
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() =>
                      onToggleScope(meta.scope as APIKeyScope)
                    }
                    aria-label={label}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {label}
                      </span>
                      <code className="font-mono text-[10px] text-muted-foreground">
                        {meta.scope}
                      </code>
                    </div>
                    {desc && (
                      <p className="text-[11px] text-muted-foreground">
                        {desc}
                      </p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
