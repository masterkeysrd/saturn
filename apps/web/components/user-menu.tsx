import { Link } from "react-router-dom"
import {
  ChevronDown,
  Layers,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react"
import { useAuth } from "@/features/auth/use-auth"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
]

export function UserMenu() {
  const { user, logoutUser } = useAuth()
  const { theme, setTheme } = useTheme()

  const initials = (user?.name || user?.username || "U")
    .substring(0, 2)
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="User menu"
            className="h-8 cursor-pointer gap-1.5 rounded-lg px-1.5 hover:bg-muted/70"
          />
        }
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary select-none">
          {initials}
        </span>
        <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <div className="flex items-center gap-2.5 px-2.5 py-2 select-none">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </div>
          <div className="flex min-w-0 flex-col text-left">
            <span className="truncate text-sm font-semibold text-foreground">
              {user?.name || user?.username || "User"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user?.email || "No email"}
            </span>
          </div>
        </div>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5">
          <p className="mb-1.5 px-0.5 text-xs font-medium text-muted-foreground">
            Appearance
          </p>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon
              const isActive = theme === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all",
                    isActive
                      ? "bg-background text-foreground shadow-2xs dark:bg-card"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          render={<Link to="/settings/account" />}
          className="cursor-pointer"
        >
          <User className="size-4 text-muted-foreground" />
          <span>Account</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link to="/settings/security/credentials" />}
          className="cursor-pointer"
        >
          <ShieldCheck className="size-4 text-muted-foreground" />
          <span>Security &amp; Logins</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link to="/settings/spaces" />}
          className="cursor-pointer"
        >
          <Layers className="size-4 text-muted-foreground" />
          <span>Workspaces</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={() => logoutUser()}
          className="cursor-pointer"
        >
          <LogOut className="size-4" />
          <span>Log Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
