import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface FormDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  submitLabel: string
  cancelLabel?: string
  isPending?: boolean
  disabled?: boolean
  hideSubmitButton?: boolean
  onSubmit: (e: React.FormEvent) => void
  children: React.ReactNode
  className?: string
}

export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  icon,
  submitLabel,
  cancelLabel = "Cancel",
  isPending = false,
  disabled = false,
  hideSubmitButton = false,
  onSubmit,
  children,
  className,
}: FormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          "flex h-full flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 shadow-xl sm:max-w-md",
          className
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <SheetTitle className="flex items-center gap-2 pr-8 text-lg font-semibold tracking-tight">
            {icon}
            <span>{title}</span>
          </SheetTitle>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {children}
          </div>

          {!hideSubmitButton && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 bg-card px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                disabled={isPending || disabled}
                className="min-w-28"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{submitLabel}</span>
              </Button>
            </div>
          )}
        </form>
      </SheetContent>
    </Sheet>
  )
}

export interface FormFieldItemProps {
  label: React.ReactNode
  error?: string
  subtext?: React.ReactNode
  optionalText?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}

export function FormFieldItem({
  label,
  error,
  subtext,
  optionalText,
  children,
  className,
  id,
}: FormFieldItemProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor={id}
          className="text-[13px] font-medium text-foreground/90"
        >
          {label}
        </Label>
        {optionalText && (
          <span className="text-xs text-muted-foreground">{optionalText}</span>
        )}
      </div>
      {children}
      {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}
