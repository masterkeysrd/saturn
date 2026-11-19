import { useId } from "react"
import { cn } from "@/lib/utils"

export type SaturnMarkSize = "xs" | "sm" | "md" | "lg" | "xl"
export type SaturnMarkVariant = "mark" | "badge"

export interface SaturnMarkProps {
  size?: SaturnMarkSize
  variant?: SaturnMarkVariant
  className?: string
  iconClassName?: string
  decorative?: boolean
}

const BADGE_SIZE_CLASSES: Record<SaturnMarkSize, string> = {
  xs: "size-6 rounded-md",
  sm: "size-7 rounded-lg",
  md: "size-9 rounded-xl",
  lg: "size-12 rounded-2xl",
  xl: "size-20 rounded-2xl",
}

const ICON_SIZE_CLASSES: Record<SaturnMarkSize, string> = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-7",
  xl: "size-11",
}

export function SaturnMark({
  size = "md",
  variant = "mark",
  className,
  iconClassName,
  decorative = false,
}: SaturnMarkProps) {
  const maskId = useId()

  const svg = (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Saturn"}
      className={cn(
        ICON_SIZE_CLASSES[size],
        "text-primary",
        variant === "mark" && className,
        iconClassName
      )}
    >
      <defs>
        <mask id={maskId}>
          <rect width="32" height="32" fill="white" />
          <path
            d="M 29.5 16 A 13.5 4.2 0 0 1 2.5 16"
            stroke="black"
            strokeWidth="4.4"
            strokeLinecap="round"
            fill="none"
            transform="rotate(-24 16 16)"
          />
        </mask>
      </defs>
      <path
        d="M 2.5 16 A 13.5 4.2 0 0 1 29.5 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.65"
        transform="rotate(-24 16 16)"
      />
      <circle
        cx="16"
        cy="16"
        r="7.4"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
      <path
        d="M 29.5 16 A 13.5 4.2 0 0 1 2.5 16"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        transform="rotate(-24 16 16)"
      />
    </svg>
  )

  if (variant === "mark") {
    return svg
  }

  return (
    <div
      data-slot="saturn-mark"
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-primary/20 bg-primary/10 shadow-2xs select-none dark:border-primary/25 dark:bg-primary/15",
        BADGE_SIZE_CLASSES[size],
        className
      )}
    >
      {svg}
    </div>
  )
}
