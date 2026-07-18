import { useNavigate } from "react-router-dom"
import { useAuth } from "@/features/auth/use-auth"
import { Button } from "@/components/ui/button"
import {
  ArrowLeftIcon,
  UserIcon,
  MailIcon,
  HashIcon,
  BadgeCheckIcon,
} from "lucide-react"

export function ProfileView() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const initials = (user?.name || user?.username || "U")
    .substring(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-2">
      <div className="w-full max-w-lg animate-in overflow-hidden rounded-3xl border border-border/50 bg-card/60 p-8 shadow-2xl backdrop-blur-xl duration-400 zoom-in-95 fade-in dark:bg-card/40">
        {/* Header with back button */}
        <div className="mb-8 flex items-center justify-between select-none">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="cursor-pointer rounded-xl hover:bg-muted/80"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Account Profile
          </h1>
          <div className="w-9" /> {/* Spacer */}
        </div>

        {/* Profile Avatar Header section */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-tr from-primary to-accent text-3xl font-extrabold text-white shadow-xl shadow-primary/25">
              {initials}
            </div>
            <div className="absolute -right-1.5 -bottom-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-green-500 text-white shadow-md">
              <BadgeCheckIcon className="h-4 w-4" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-foreground">{user?.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            @{user?.username || "username"}
          </p>
        </div>

        {/* Account Details list */}
        <div className="space-y-4 rounded-2xl border border-border/40 bg-muted/20 p-5 text-sm select-none">
          <div className="flex items-center gap-3">
            <UserIcon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Full Name
              </span>
              <span className="mt-0.5 text-sm font-medium text-foreground">
                {user?.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-border/40 pt-4">
            <MailIcon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col text-left">
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Email Address
              </span>
              <span className="mt-0.5 text-sm font-medium text-foreground">
                {user?.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-border/40 pt-4">
            <HashIcon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col overflow-hidden text-left">
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                User Identifier
              </span>
              <span className="mt-1 max-w-xs truncate font-mono text-xs text-foreground/80">
                {user?.id}
              </span>
            </div>
          </div>
        </div>

        {/* Back button */}
        <Button
          onClick={() => navigate("/")}
          className="mt-8 w-full cursor-pointer rounded-2xl py-6 font-semibold shadow-lg shadow-primary/10 transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          Return to Dashboard
        </Button>
      </div>
    </div>
  )
}
