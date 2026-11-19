import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
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

const FormDialogShellContext = React.createContext(false)

export interface FormDialogShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  className?: string
}

export function FormDialogShell({
  open,
  onOpenChange,
  children,
  className,
}: FormDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(88svh,44rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl sm:max-w-lg",
          className
        )}
      >
        <FormDialogShellContext.Provider value={true}>
          {children}
        </FormDialogShellContext.Provider>
      </DialogContent>
    </Dialog>
  )
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
  const isInsideShell = React.useContext(FormDialogShellContext)

  const innerContent = (
    <>
      <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
        <DialogTitle className="flex items-center gap-2 pr-8 text-lg font-semibold tracking-tight">
          {icon}
          <span>{title}</span>
        </DialogTitle>
        {description && (
          <DialogDescription className="text-xs text-muted-foreground">
            {description}
          </DialogDescription>
        )}
      </DialogHeader>

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
    </>
  )

  if (isInsideShell) {
    return innerContent
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(88svh,44rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl sm:max-w-lg",
          className
        )}
      >
        {innerContent}
      </DialogContent>
    </Dialog>
  )
}

export { FormDrawer as FormDialog }
export type FormDialogProps = FormDrawerProps

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
