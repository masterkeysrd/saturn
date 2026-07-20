import { useState } from "react"
import { useMySpaces, useActiveSpaceContext } from "@/features/space/use-space"
import { useNavigate } from "react-router-dom"
import { ChevronDownIcon, Loader2, SettingsIcon } from "lucide-react"
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

export function SpaceSelector() {
  const { user } = useAuth()
  const { spaces, isLoading } = useMySpaces()
  const { spaceId, activeSpace, switchSpace } = useActiveSpaceContext()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {!isCollapsed && <span>Loading spaces...</span>}
      </div>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          isCollapsed ? (
            <Button
              variant="ghost"
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 p-0 select-none hover:bg-primary/20"
            >
              <span className="text-xs font-bold text-primary">
                {activeSpace?.name ? activeSpace.name[0].toUpperCase() : "S"}
              </span>
            </Button>
          ) : (
            <Button variant="ghost" className="w-full justify-start gap-2 px-3">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
                {activeSpace?.name ? activeSpace.name[0].toUpperCase() : "S"}
              </div>
              <span className="truncate text-sm font-medium text-foreground">
                {activeSpace ? activeSpace.name : "Select Space"}
              </span>
              <ChevronDownIcon className="ml-auto h-4 w-4 text-muted-foreground" />
            </Button>
          )
        }
      />
      <DropdownMenuContent className="w-64">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {spaces.length} Workspace{spaces.length !== 1 ? "s" : ""}
        </div>
        <DropdownMenuSeparator />
        {spaces.map((space) => (
          <DropdownMenuItem
            key={space.id}
            onClick={() => {
              const role =
                user && space.ownerId === user.id ? "owner" : "member"
              switchSpace({
                spaceId: space.id,
                spaceName: space.name,
                spaceRole: role,
              })
              setOpen(false)
            }}
            className={cn(
              "justify-between",
              space.id === spaceId && "bg-accent font-medium"
            )}
          >
            <span className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                {space.name?.[0]?.toUpperCase() ?? "S"}
              </div>
              {space.name}
            </span>
            {space.id === spaceId && (
              <span className="text-xs text-green-600">Active</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setOpen(false)
            navigate("/settings?tab=spaces")
          }}
          className="justify-between"
        >
          <span className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            Manage Spaces
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
