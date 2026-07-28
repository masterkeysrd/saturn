import {
  Controller,
  type FieldValues,
  type Path,
  type Control,
} from "react-hook-form"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface FormSelectProps<TFieldValues extends FieldValues = FieldValues> {
  control: Control<TFieldValues, any, any>
  name: Path<TFieldValues>
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  items: Array<{ value: string; label: string }>
  helperText?: string
}

export function FormSelect<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  disabled,
  className,
  triggerClassName,
  items,
  helperText,
}: FormSelectProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selectedItem = items.find((i) => i.value === field.value)
        return (
          <div className={cn("space-y-1.5", className)}>
            {label && (
              <Label
                htmlFor={name}
                className="text-xs font-semibold tracking-wider text-muted-foreground/90 uppercase"
              >
                {label}
              </Label>
            )}
            <Select
              items={items}
              value={field.value}
              onValueChange={(val) => field.onChange(val || "")}
              disabled={disabled}
            >
              <SelectTrigger
                id={name}
                className={cn(
                  "!h-11 w-full rounded-xl border-border/60 bg-background/50 text-left",
                  disabled && "opacity-70",
                  triggerClassName
                )}
              >
                <SelectValue placeholder={placeholder}>
                  {selectedItem ? selectedItem.label : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                {items.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    label={item.label}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {helperText && !fieldState.error && (
              <span className="mt-1 block text-[10px] text-muted-foreground/75">
                {helperText}
              </span>
            )}
            {fieldState.error && (
              <p className="text-[11px] font-semibold text-destructive">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )
      }}
    />
  )
}
