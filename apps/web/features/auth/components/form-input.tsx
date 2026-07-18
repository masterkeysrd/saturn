import type { InputHTMLAttributes } from "react"

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string | null
}

export function FormInput({
  label,
  error,
  className = "",
  id,
  ...props
}: FormInputProps) {
  return (
    <div className="flex flex-col space-y-1.5">
      <div className="relative">
        <input
          id={id}
          className={`peer block w-full rounded-2xl border border-border/60 bg-input/20 px-4 pt-6 pb-2 text-sm text-foreground placeholder-transparent transition-all duration-200 outline-none focus:border-primary/80 focus:ring-4 focus:ring-primary/15 disabled:opacity-50 dark:bg-input/10 ${
            error
              ? "border-destructive/60 focus:border-destructive focus:ring-destructive/15"
              : ""
          } ${className}`}
          placeholder={label}
          {...props}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute top-4 left-4 z-10 origin-[0] -translate-y-2.5 scale-75 transform text-xs text-muted-foreground/80 duration-200 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2.5 peer-focus:scale-75 peer-focus:text-primary dark:peer-focus:text-primary/95"
        >
          {label}
        </label>
      </div>
      {error && (
        <span className="animate-in px-1 text-xs text-destructive duration-200 slide-in-from-top-1">
          {error}
        </span>
      )}
    </div>
  )
}
