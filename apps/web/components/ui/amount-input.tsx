import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"

interface BaseAmountInputProps extends Omit<
  React.ComponentProps<"input">,
  "value" | "onChange"
> {
  currency?: string
  className?: string
  showError?: boolean
}

export type AmountInputProps<TFieldValues extends FieldValues = FieldValues> =
  | (BaseAmountInputProps & {
      control?: undefined
      name?: undefined
      value?: string | number
      onValueChange?: (value: string) => void
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
    })
  | (BaseAmountInputProps & {
      control: Control<TFieldValues>
      name: Path<TFieldValues>
      value?: undefined
      onValueChange?: (value: string) => void
      onChange?: undefined
    })

function formatAmountString(val: string): string {
  if (!val) return ""
  const parts = val.split(".")
  const rawInt = parts[0].replace(/\D/g, "")
  if (!rawInt && parts.length === 1) return ""

  const formattedInt = rawInt
    ? parseInt(rawInt, 10).toLocaleString("en-US")
    : "0"

  if (parts.length > 1) {
    const rawDec = parts[1].replace(/\D/g, "").slice(0, 2)
    return `${formattedInt}.${rawDec}`
  }

  return formattedInt
}

function parseAmountString(formattedVal: string): string {
  if (!formattedVal) return ""
  const parts = formattedVal.split(".")
  const rawInt = parts[0].replace(/\D/g, "")
  if (parts.length > 1) {
    const rawDec = parts[1].replace(/\D/g, "").slice(0, 2)
    return `${rawInt || "0"}.${rawDec}`
  }
  return rawInt
}

const AmountInputInner = React.forwardRef<
  HTMLInputElement,
  BaseAmountInputProps & {
    value?: string | number
    onValueChange?: (rawUnformattedValue: string) => void
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  }
>(
  (
    {
      value,
      onValueChange,
      onChange,
      currency,
      className,
      placeholder = "0.00",
      disabled,
      ...props
    },
    ref
  ) => {
    const displayValue = React.useMemo(() => {
      const strVal = typeof value === "number" ? value.toString() : value || ""
      return formatAmountString(strVal)
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputVal = e.target.value
      const rawVal = inputVal ? parseAmountString(inputVal) : ""
      e.target.value = rawVal

      if (onValueChange) {
        onValueChange(rawVal)
      }
      if (onChange) {
        onChange(e)
      }
    }

    return (
      <div className="relative flex w-full items-center">
        {currency && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-extrabold text-muted-foreground uppercase select-none">
            {currency}
          </span>
        )}
        <Input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "h-11 rounded-xl font-bold text-foreground transition-all",
            currency ? "pl-12" : "pl-3",
            className
          )}
          {...props}
        />
      </div>
    )
  }
)

AmountInputInner.displayName = "AmountInputInner"

export function AmountInput<TFieldValues extends FieldValues = FieldValues>(
  props: AmountInputProps<TFieldValues>
) {
  if ("control" in props && props.control && props.name) {
    const { control, name, onValueChange, showError = true, ...rest } = props
    return (
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <div className="w-full">
            <AmountInputInner
              {...rest}
              ref={field.ref}
              value={field.value ?? ""}
              onValueChange={(val) => {
                field.onChange(val)
                onValueChange?.(val)
              }}
            />
            {showError && fieldState.error && (
              <p className="mt-1 text-[11px] font-semibold text-destructive">
                {fieldState.error.message}
              </p>
            )}
          </div>
        )}
      />
    )
  }

  const { value, onValueChange, onChange, ...rest } =
    props as BaseAmountInputProps & {
      value?: string | number
      onValueChange?: (val: string) => void
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
    }

  return (
    <AmountInputInner
      {...rest}
      value={value}
      onValueChange={onValueChange}
      onChange={onChange}
    />
  )
}
