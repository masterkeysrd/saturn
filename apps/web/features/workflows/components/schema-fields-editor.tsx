import { useState } from "react"
import {
  fieldsToJsonSchema,
  jsonSchemaToFields,
  JSON_SCHEMA_FIELD_TYPES,
  type JsonSchemaFieldType,
  type JsonSchemaFieldValues,
} from "@saturn/schemas"
import { useI18n } from "@saturn/hooks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Plus,
  Trash2,
  Code2,
  ListTree,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

interface SchemaFieldsEditorProps {
  label: string
  value?: Record<string, unknown>
  onChange: (next?: Record<string, unknown>) => void
  emptyText?: string
}

export function SchemaFieldsEditor({
  label,
  value,
  onChange,
  emptyText,
}: SchemaFieldsEditorProps) {
  const { t } = useI18n()
  const [rawMode, setRawMode] = useState(false)
  const [rawError, setRawError] = useState<string | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [rawDraft, setRawDraft] = useState<string>(() =>
    value ? JSON.stringify(value, null, 2) : ""
  )

  const fields = jsonSchemaToFields(value)

  const commitFields = (nextFields: JsonSchemaFieldValues[]) => {
    if (nextFields.length === 0) {
      onChange(undefined)
      setRawDraft("")
      return
    }
    const schema = fieldsToJsonSchema(nextFields)
    onChange(schema)
    setRawDraft(JSON.stringify(schema, null, 2))
  }

  const handleAddField = () => {
    const idx = fields.length + 1
    const next = [
      ...fields,
      {
        name: `field_${idx}`,
        type: "string" as JsonSchemaFieldType,
        required: true,
        description: "",
      },
    ]
    commitFields(next)
    setExpandedIndex(next.length - 1)
  }

  const handleUpdateField = (
    index: number,
    patch: Partial<JsonSchemaFieldValues>
  ) => {
    const updated = fields.map((f, i) => (i === index ? { ...f, ...patch } : f))
    commitFields(updated)
  }

  const handleRemoveField = (index: number) => {
    commitFields(fields.filter((_, i) => i !== index))
    if (expandedIndex === index) setExpandedIndex(null)
  }

  const toggleMode = () => {
    if (!rawMode) {
      setRawDraft(
        value
          ? JSON.stringify(value, null, 2)
          : '{\n  "type": "object",\n  "properties": {}\n}'
      )
      setRawError(null)
    }
    setRawMode(!rawMode)
  }

  const handleRawBlur = () => {
    const trimmed = rawDraft.trim()
    if (!trimmed) {
      setRawError(null)
      onChange(undefined)
      return
    }
    try {
      const parsed = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setRawError(t("workflows.schema.schemaObjectError"))
        return
      }
      setRawError(null)
      onChange(parsed as Record<string, unknown>)
    } catch (err) {
      setRawError(
        err instanceof Error ? err.message : t("workflows.schema.invalidJson")
      )
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-muted-foreground">
          {label}
        </Label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleMode}
            className="h-7 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground"
          >
            {rawMode ? (
              <>
                <ListTree className="h-3 w-3" />
                {t("workflows.schema.visual")}
              </>
            ) : (
              <>
                <Code2 className="h-3 w-3" />
                {t("workflows.schema.json")}
              </>
            )}
          </Button>
          {!rawMode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddField}
              className="h-7 gap-1 rounded-lg px-2 text-[11px] text-primary"
            >
              <Plus className="h-3 w-3" />
              {t("workflows.schema.addField")}
            </Button>
          )}
        </div>
      </div>

      {rawMode ? (
        <div className="space-y-1.5">
          <Textarea
            value={rawDraft}
            onChange={(e) => setRawDraft(e.target.value)}
            onBlur={handleRawBlur}
            rows={6}
            className="rounded-xl font-mono text-xs"
            placeholder='{"type": "object", "properties": {}}'
          />
          {rawError && (
            <p className="text-[11px] font-medium text-destructive">
              {rawError}
            </p>
          )}
        </div>
      ) : fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {emptyText ?? t("workflows.schema.empty")}
        </p>
      ) : (
        <div className="divide-y divide-border/40 rounded-xl bg-muted/30">
          {fields.map((field, index) => {
            const isExpanded = expandedIndex === index
            return (
              <div key={`${field.name}-${index}`} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedIndex(isExpanded ? null : index)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                  >
                    <span className="truncate font-mono text-xs font-semibold text-foreground">
                      {field.name}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {field.type}
                    </span>
                    {field.required && (
                      <span className="text-[10px] font-semibold text-primary">
                        req
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        setExpandedIndex(isExpanded ? null : index)
                      }
                      className="h-6 w-6 text-muted-foreground"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveField(index)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title={t("workflows.schema.removeField")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-2.5 border-t border-border/30 pt-2.5">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {t("workflows.schema.fieldName")}
                      </Label>
                      <Input
                        value={field.name}
                        onChange={(e) =>
                          handleUpdateField(index, { name: e.target.value })
                        }
                        className="h-8 rounded-lg font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {t("workflows.schema.type")}
                      </Label>
                      <Select
                        value={field.type}
                        onValueChange={(nextType) =>
                          handleUpdateField(index, {
                            type: (nextType ?? "string") as JsonSchemaFieldType,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 rounded-lg text-xs">
                          <SelectValue>{field.type}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {JSON_SCHEMA_FIELD_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {t("workflows.schema.hint")}
                      </Label>
                      <Input
                        value={field.description ?? ""}
                        onChange={(e) =>
                          handleUpdateField(index, {
                            description: e.target.value,
                          })
                        }
                        placeholder={t("workflows.schema.hintPlaceholder")}
                        className="h-8 rounded-lg text-xs"
                      />
                    </div>
                    <label className="flex cursor-pointer items-center justify-between pt-1 text-xs text-muted-foreground">
                      <span>{t("workflows.schema.required")}</span>
                      <Switch
                        size="sm"
                        checked={field.required}
                        onCheckedChange={(checked) =>
                          handleUpdateField(index, {
                            required: Boolean(checked),
                          })
                        }
                      />
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
