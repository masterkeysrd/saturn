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
  isPending?: boolean
  disabled?: boolean
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
  isPending = false,
  disabled = false,
  onSubmit,
  children,
  className,
}: FormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          "rounded-none border-none border-border/40 bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-l-3xl sm:border-l md:p-8",
          className
        )}
      >
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            {icon}
            <span>{title}</span>
          </SheetTitle>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          {children}

          <div className="w-full pt-4">
            <Button
              type="submit"
              disabled={isPending || disabled}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/10 transition-all hover:scale-[1.01]"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{submitLabel}</span>
            </Button>
          </div>
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
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label
          htmlFor={id}
          className="text-xs font-bold tracking-wider text-foreground uppercase"
        >
          {label}
        </Label>
        {optionalText && (
          <span className="text-[10px] font-medium text-muted-foreground">
            {optionalText}
          </span>
        )}
      </div>
      {children}
      {subtext && (
        <p className="text-[10px] text-muted-foreground">{subtext}</p>
      )}
      {error && (
        <p className="text-[11px] font-semibold text-destructive">{error}</p>
      )}
    </div>
  )
}
