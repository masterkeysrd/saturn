import { Fragment, type ReactElement, type ElementType } from "react"
import { MoreHorizontal } from "lucide-react"
import { useI18n } from "@saturn/hooks"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
export function DetailActions({
  items,
}: {
  items: {
    label: string
    render?: ReactElement
    onClick?: () => void
    disabled?: boolean
    icon?: ElementType
    destructive?: boolean
    separatorBefore?: boolean
  }[]
}) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={t("finance.budgets.mobile.menuActions")}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className={
                item.destructive
                  ? "text-destructive focus:bg-destructive/10 focus:text-destructive"
                  : undefined
              }
              variant={item.destructive ? "destructive" : "default"}
              render={item.render}
              onClick={item.onClick}
              disabled={item.disabled}
            >
              {item.icon && <item.icon className="size-4" />}
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
