import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:border-destructive/30 dark:bg-destructive/15 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        success:
          "border-success/20 bg-success/10 text-success dark:border-success/30 dark:bg-success/15",
        warning:
          "border-warning/25 bg-warning/12 text-amber-700 dark:border-warning/30 dark:bg-warning/15 dark:text-warning",
        info: "border-info/20 bg-info/10 text-info dark:border-info/30 dark:bg-info/15",
        neutral:
          "border-border/70 bg-muted text-muted-foreground dark:bg-white/[0.05]",
        outline:
          "border-border bg-background text-foreground dark:bg-white/[0.02] [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const DOT_COLOR_CLASSES: Record<
  NonNullable<VariantProps<typeof badgeVariants>["variant"]>,
  string
> = {
  default: "bg-primary-foreground",
  secondary: "bg-secondary-foreground/70",
  destructive: "bg-destructive",
  success: "bg-success",
  warning: "bg-amber-600 dark:bg-warning",
  info: "bg-info",
  neutral: "bg-muted-foreground",
  outline: "bg-foreground/70",
  ghost: "bg-muted-foreground",
  link: "bg-primary",
}

function Badge({
  className,
  variant = "default",
  dot = false,
  render,
  children,
  ...props
}: useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  const resolvedVariant = variant ?? "default"

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant: resolvedVariant }), className),
        children: (
          <>
            {dot && (
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  DOT_COLOR_CLASSES[resolvedVariant]
                )}
              />
            )}
            {children}
          </>
        ),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant: resolvedVariant,
    },
  })
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
