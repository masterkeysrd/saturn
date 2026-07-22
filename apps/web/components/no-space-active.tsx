import { ArrowRight, Layers } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export function NoSpaceActiveScreen() {
  return (
    <div className="flex flex-1 animate-in flex-col items-center justify-center py-20 text-center duration-500 select-none zoom-in-95 fade-in">
      <div className="max-w-md space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-border/40 bg-muted/40 text-muted-foreground shadow-sm">
          <Layers className="h-10 w-10 text-primary" />
        </div>
        <div className="space-y-2 px-4">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            No Active Space
          </h1>
          <p className="text-sm text-muted-foreground">
            Saturn organizes your budgets, cash flows, and personal habits into
            isolated Spaces. Select one from the sidebar or click below to
            manage your spaces.
          </p>
        </div>
        <div className="flex justify-center pt-2">
          <Link to="/settings?tab=spaces">
            <Button className="flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:opacity-95">
              Manage Spaces
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
