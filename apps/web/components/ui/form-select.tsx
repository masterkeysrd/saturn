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
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  items: Array<{ value: string; label: string; triggerLabel?: string }>
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
        const selectedItem =
          items.find((i) => i.value === field.value) ||
          items.find(
            (i) =>
              field.value &&
              (String(field.value).endsWith(i.value) ||
                i.value.endsWith(String(field.value)))
          )
        const hasWrapper = !!(label || helperText || fieldState.error)

        const selectElement = (
          <Select
            value={field.value}
            onValueChange={(val) => field.onChange(val || "")}
            disabled={disabled}
          >
            <SelectTrigger
              id={name}
              className={cn(
                "w-full text-left",
                disabled && "opacity-70",
                triggerClassName,
                !hasWrapper && className
              )}
            >
              <SelectValue placeholder={placeholder}>
                {selectedItem
                  ? selectedItem.triggerLabel || selectedItem.label
                  : field.value || undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-(--anchor-width) min-w-56">
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
        )

        if (!hasWrapper) {
          return selectElement
        }

        return (
          <div className={cn("space-y-1.5", className)}>
            {label && (
              <Label
                htmlFor={name}
                className="text-[13px] font-medium text-foreground/90"
              >
                {label}
              </Label>
            )}
            {selectElement}
            {helperText && !fieldState.error && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {helperText}
              </span>
            )}
            {fieldState.error && (
              <p className="text-xs font-medium text-destructive">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )
      }}
    />
  )
}
