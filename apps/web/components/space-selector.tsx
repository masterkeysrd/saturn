import { useState } from "react"
import { useMySpaces, useActiveSpaceContext } from "@/features/space/use-space"
import { useLocation, useNavigate } from "react-router-dom"
import { Check, ChevronsUpDown, Loader2, SettingsIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/components/ui/sidebar"
import { useAuth } from "@/features/auth/use-auth"
import { resolveNextSpaceRoute } from "@/lib/space-route"

export function SpaceSelector({ className }: { className?: string }) {
  const { user } = useAuth()
  const { spaces, isLoading } = useMySpaces()
  const { spaceId, activeSpace, switchSpace } = useActiveSpaceContext()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()

  if (isLoading) {
    return (
      <div className="flex h-7 items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="hidden sm:inline">Loading...</span>
      </div>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Switch Workspace"
            className={cn(
              "h-7 max-w-[180px] cursor-pointer gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-muted/70 sm:max-w-[220px]",
              className
            )}
          />
        }
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/12 text-[11px] font-semibold text-primary">
          {activeSpace?.name ? activeSpace.name[0].toUpperCase() : "S"}
        </span>
        <span className="truncate">
          {activeSpace ? activeSpace.name : "Select Space"}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-64">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {spaces.length} Workspace{spaces.length !== 1 ? "s" : ""}
        </div>
        <DropdownMenuSeparator />
        {spaces.map((space) => (
          <DropdownMenuItem
            key={space.id}
            onClick={() => {
              const nextSpaceId = space.id || ""
              const role = user && space.ownerId === user.id ? "owner" : ""
              switchSpace({
                spaceId: nextSpaceId,
                spaceName: space.name,
                spaceRole: role,
              })
              setOpen(false)
              if (isMobile) setOpenMobile(false)
              if (nextSpaceId) {
                const targetRoute = resolveNextSpaceRoute(
                  location.pathname,
                  nextSpaceId
                )
                if (targetRoute) {
                  navigate(targetRoute)
                }
              }
            }}
            className={cn(
              "cursor-pointer justify-between",
              space.id === spaceId && "bg-accent font-medium"
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/12 text-[11px] font-semibold text-primary">
                {space.name?.[0]?.toUpperCase() ?? "S"}
              </span>
              <span className="truncate">{space.name}</span>
            </span>
            {space.id === spaceId && (
              <Check className="size-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setOpen(false)
            navigate("/settings/spaces")
            if (isMobile) setOpenMobile(false)
          }}
          className="cursor-pointer"
        >
          <SettingsIcon className="size-4 text-muted-foreground" />
          <span>Manage Spaces</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
