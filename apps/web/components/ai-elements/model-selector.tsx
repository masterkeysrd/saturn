import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ProviderLogo } from "@/features/ai/components/provider-logo"
import type { ComponentProps, ReactNode } from "react"

export type ModelSelectorProps = ComponentProps<typeof Popover>
export const ModelSelector = (props: ModelSelectorProps) => (
  <Popover {...props} />
)

export type ModelSelectorTriggerProps = ComponentProps<typeof PopoverTrigger>
export const ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => (
  <PopoverTrigger {...props} />
)

export type ModelSelectorContentProps = ComponentProps<
  typeof PopoverContent
> & {
  title?: ReactNode
}

export const ModelSelectorContent = ({
  className,
  children,
  title = "Select Model",
  align = "start",
  side = "bottom",
  sideOffset = 6,
  ...props
}: ModelSelectorContentProps) => (
  <PopoverContent
    align={align}
    side={side}
    sideOffset={sideOffset}
    aria-label={typeof title === "string" ? title : "Select Model"}
    className={cn(
      "w-72 gap-0 overflow-hidden rounded-2xl p-0 shadow-xl sm:w-80",
      className
    )}
    {...props}
  >
    <Command className="rounded-none">{children}</Command>
  </PopoverContent>
)

export type ModelSelectorInputProps = ComponentProps<typeof CommandInput>
export const ModelSelectorInput = ({
  className,
  ...props
}: ModelSelectorInputProps) => (
  <CommandInput className={cn("h-10 text-sm", className)} {...props} />
)

export type ModelSelectorListProps = ComponentProps<typeof CommandList>
export const ModelSelectorList = (props: ModelSelectorListProps) => (
  <CommandList {...props} />
)

export type ModelSelectorEmptyProps = ComponentProps<typeof CommandEmpty>
export const ModelSelectorEmpty = (props: ModelSelectorEmptyProps) => (
  <CommandEmpty {...props} />
)

export type ModelSelectorGroupProps = ComponentProps<typeof CommandGroup>
export const ModelSelectorGroup = (props: ModelSelectorGroupProps) => (
  <CommandGroup {...props} />
)

export type ModelSelectorItemProps = ComponentProps<typeof CommandItem>
export const ModelSelectorItem = ({
  className,
  ...props
}: ModelSelectorItemProps) => (
  <CommandItem className={cn("cursor-pointer gap-2", className)} {...props} />
)

export type ModelSelectorSeparatorProps = ComponentProps<
  typeof CommandSeparator
>
export const ModelSelectorSeparator = (props: ModelSelectorSeparatorProps) => (
  <CommandSeparator {...props} />
)

export type ModelSelectorLogoProps = {
  driver?: string
  className?: string
}

export const ModelSelectorLogo = ({
  driver,
  className,
}: ModelSelectorLogoProps) => (
  <ProviderLogo driver={driver} className={cn("size-3.5", className)} />
)

export type ModelSelectorNameProps = ComponentProps<"span">
export const ModelSelectorName = ({
  className,
  ...props
}: ModelSelectorNameProps) => (
  <span className={cn("flex-1 truncate text-left", className)} {...props} />
)

export const ModelSelectorButton = ({
  className,
  ...props
}: ComponentProps<typeof Button>) => (
  <Button
    variant="outline"
    size="sm"
    type="button"
    className={cn("h-8 cursor-pointer gap-1.5 rounded-full text-xs", className)}
    {...props}
  />
)
