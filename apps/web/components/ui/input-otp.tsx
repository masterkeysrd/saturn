import { OTPField } from "@base-ui/react/otp-field"
import { Minus } from "lucide-react"
import { cn } from "@/lib/utils"

export interface InputOTPProps {
  value?: string
  onChange?: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  error?: boolean | string
  className?: string
  length?: number
  id?: string
  name?: string
}

export function InputOTP({
  value = "",
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  error,
  className,
  length = 6,
  id,
  name,
}: InputOTPProps) {
  const half = Math.floor(length / 2)

  return (
    <div className="flex flex-col items-center gap-2">
      <OTPField.Root
        id={id}
        name={name}
        length={length}
        value={value}
        onValueChange={(val) => onChange?.(val)}
        onValueComplete={(val) => onComplete?.(val)}
        disabled={disabled}
        autoFocus={autoFocus}
        validationType="numeric"
        className={cn(
          "flex items-center justify-center gap-2 select-none",
          className
        )}
      >
        <div className="flex items-center gap-2">
          {Array.from({ length: half }, (_, i) => (
            <OTPField.Input
              key={i}
              className={cn(
                "flex h-13 w-11 items-center justify-center rounded-xl border bg-card/80 text-center font-mono text-2xl font-bold text-foreground shadow-xs transition-all sm:h-14 sm:w-12",
                "border-border/60 hover:border-border/80",
                "focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20 focus:outline-none",
                error
                  ? "border-destructive/80 text-destructive focus:border-destructive focus:ring-destructive/20"
                  : "",
                disabled && "cursor-not-allowed bg-muted/30 opacity-50"
              )}
              aria-label={`Digit ${i + 1} of ${length}`}
            />
          ))}
        </div>

        <OTPField.Separator className="flex items-center justify-center px-0.5 text-muted-foreground/40">
          <Minus className="h-4 w-4" />
        </OTPField.Separator>

        <div className="flex items-center gap-2">
          {Array.from({ length: length - half }, (_, i) => (
            <OTPField.Input
              key={half + i}
              className={cn(
                "flex h-13 w-11 items-center justify-center rounded-xl border bg-card/80 text-center font-mono text-2xl font-bold text-foreground shadow-xs transition-all sm:h-14 sm:w-12",
                "border-border/60 hover:border-border/80",
                "focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20 focus:outline-none",
                error
                  ? "border-destructive/80 text-destructive focus:border-destructive focus:ring-destructive/20"
                  : "",
                disabled && "cursor-not-allowed bg-muted/30 opacity-50"
              )}
              aria-label={`Digit ${half + i + 1} of ${length}`}
            />
          ))}
        </div>
      </OTPField.Root>

      {typeof error === "string" && error && (
        <p className="animate-in text-xs text-destructive fade-in">{error}</p>
      )}
    </div>
  )
}
