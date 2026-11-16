import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ShieldAlertIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, useContext } from "react"

export type ConfirmationState =
  "approval-requested" | "approval-approved" | "approval-rejected"

interface ConfirmationContextValue {
  state: ConfirmationState
}

const ConfirmationContext = createContext<ConfirmationContextValue>({
  state: "approval-requested",
})

const useConfirmation = () => useContext(ConfirmationContext)

export type ConfirmationProps = ComponentProps<"div"> & {
  state?: ConfirmationState
}

export const Confirmation = ({
  className,
  state = "approval-requested",
  children,
  ...props
}: ConfirmationProps) => (
  <ConfirmationContext.Provider value={{ state }}>
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-sm",
        className
      )}
      {...props}
    >
      {children}
    </div>
  </ConfirmationContext.Provider>
)

export type ConfirmationTitleProps = ComponentProps<"div"> & {
  icon?: ReactNode
}

export const ConfirmationTitle = ({
  className,
  icon,
  children,
  ...props
}: ConfirmationTitleProps) => (
  <div
    className={cn("flex items-start gap-2 text-xs font-medium", className)}
    {...props}
  >
    {icon ?? (
      <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
    )}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

export const ConfirmationRequest = ({ children }: { children?: ReactNode }) => {
  const { state } = useConfirmation()
  if (state !== "approval-requested") return null
  return <>{children}</>
}

export type ConfirmationActionsProps = ComponentProps<"div">

export const ConfirmationActions = ({
  className,
  ...props
}: ConfirmationActionsProps) => {
  const { state } = useConfirmation()
  if (state !== "approval-requested") return null
  return (
    <div
      className={cn("flex items-center justify-end gap-2", className)}
      {...props}
    />
  )
}

export type ConfirmationActionProps = ComponentProps<typeof Button>

export const ConfirmationAction = ({
  className,
  ...props
}: ConfirmationActionProps) => (
  <Button
    className={cn("h-8 cursor-pointer rounded-lg px-3 text-xs", className)}
    type="button"
    {...props}
  />
)
