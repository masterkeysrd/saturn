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
  allowNegative?: boolean
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

function formatAmountString(val: string, allowNegative?: boolean): string {
  if (!val) return ""
  const isNegative = allowNegative && val.startsWith("-")
  const cleanVal = val.replace(/^-/, "")
  if (!cleanVal) return isNegative ? "-" : ""

  const parts = cleanVal.split(".")
  const rawInt = parts[0].replace(/\D/g, "")
  if (!rawInt && parts.length === 1) return isNegative ? "-" : ""

  const formattedInt = rawInt
    ? parseInt(rawInt, 10).toLocaleString("en-US")
    : "0"

  let res = formattedInt
  if (parts.length > 1) {
    const rawDec = parts[1].replace(/\D/g, "").slice(0, 2)
    res = `${formattedInt}.${rawDec}`
  }

  return isNegative ? `-${res}` : res
}

function parseAmountString(formattedVal: string, allowNegative?: boolean): string {
  if (!formattedVal) return ""
  const isNegative = allowNegative && formattedVal.startsWith("-")
  const cleanVal = formattedVal.replace(/^-/, "")
  if (!cleanVal) return isNegative ? "-" : ""

  const parts = cleanVal.split(".")
  const rawInt = parts[0].replace(/\D/g, "")
  let res = rawInt
  if (parts.length > 1) {
    const rawDec = parts[1].replace(/\D/g, "").slice(0, 2)
    res = `${rawInt || "0"}.${rawDec}`
  }
  return isNegative ? `-${res}` : res
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
      allowNegative,
      ...props
    },
    forwardedRef
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null)

    React.useImperativeHandle(forwardedRef, () => inputRef.current!)

    const displayValue = React.useMemo(() => {
      const strVal = typeof value === "number" ? value.toString() : value || ""
      return formatAmountString(strVal, allowNegative)
    }, [value, allowNegative])

    const cursorRef = React.useRef<number | null>(null)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputEl = e.target
      const newVal = inputEl.value
      const selectionStart = inputEl.selectionStart ?? newVal.length

      const regex = allowNegative ? /[^0-9.-]/g : /[^0-9.]/g
      const digitsBeforeCursor = newVal
        .slice(0, selectionStart)
        .replace(regex, "").length

      const rawVal = newVal ? parseAmountString(newVal, allowNegative) : ""
      const formattedNew = formatAmountString(rawVal, allowNegative)

      let newCursorPos = 0
      let digitCount = 0
      for (let i = 0; i < formattedNew.length; i++) {
        if (digitCount === digitsBeforeCursor) {
          break
        }
        if (formattedNew[i] !== ",") {
          digitCount++
        }
        newCursorPos = i + 1
      }

      cursorRef.current = newCursorPos

      // If the formatted value doesn't change (e.g. typing an invalid letter),
      // React will not re-render and useLayoutEffect won't trigger.
      // Reset DOM value and cursor synchronously right now:
      if (formattedNew === displayValue) {
        inputEl.value = formattedNew
        inputEl.setSelectionRange(newCursorPos, newCursorPos)
        cursorRef.current = null
        return
      }

      inputEl.value = rawVal

      if (onValueChange) {
        onValueChange(rawVal)
      }
      if (onChange) {
        onChange(e)
      }
    }

    React.useLayoutEffect(() => {
      if (cursorRef.current !== null && inputRef.current) {
        const pos = cursorRef.current
        inputRef.current.setSelectionRange(pos, pos)
        cursorRef.current = null
      }
    }, [displayValue])

    return (
      <div className="relative flex w-full items-center">
        {currency && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-extrabold text-muted-foreground uppercase select-none">
            {currency}
          </span>
        )}
        <Input
          ref={inputRef}
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
