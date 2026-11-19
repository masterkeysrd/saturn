import { useState, type FormEvent } from "react"
import { useAuth } from "@/features/auth/use-auth"
import { PageLayout } from "@/components/ui/page-layout"
import { Home, Sparkles, ArrowRight, SendHorizontal } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useTimezone } from "@saturn/hooks"
import { openAIDrawer } from "@/features/ai/lib/drawer-events"
import { SaturnMark } from "@/components/ui/saturn-mark"

const QUICK_PROMPTS = [
  "Summarize my spending this month",
  "What is on my schedule this week?",
  "Check unread emails for action items",
]

export function DashboardView() {
  const { user } = useAuth()
  const { spaceId } = useActiveSpaceContext()
  const tz = useTimezone()
  const [prompt, setPrompt] = useState("")

  // Format today's date: e.g. "Saturday, July 18, 2026"
  const formattedDate = tz.formatDate(tz.now(), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  // Get a time-based greeting: "Good morning", "Good afternoon", or "Good evening"
  const getGreeting = () => {
    const hour = tz.parts()?.hour ?? 0
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const firstName = user?.name?.split(" ")[0] || "User"

  const handleAskSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed) {
      openAIDrawer()
      return
    }
    setPrompt("")
    openAIDrawer({ prompt: trimmed, autoSend: true })
  }

  return (
    <PageLayout
      title="Dashboard"
      description="Welcome to your Saturn Life OS."
      icon={Home}
      hideHeader={true}
    >
      <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
        <div className="w-full max-w-lg animate-in duration-500 zoom-in-95 fade-in">
          {/* Branding badge */}
          <div className="mb-8 flex animate-in justify-center duration-700 select-none zoom-in-75">
            <SaturnMark variant="badge" size="xl" />
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            {getGreeting()}, {firstName}!
          </h2>

          <p className="mt-3 font-mono text-xs font-semibold tracking-wider text-muted-foreground/80 uppercase">
            {formattedDate}
          </p>

          {spaceId ? (
            <div className="mt-8 space-y-3 text-left">
              <form
                onSubmit={handleAskSubmit}
                className="flex items-center gap-2 rounded-xl border border-border bg-control p-1.5 shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40"
              >
                <Sparkles className="ml-2.5 size-4 shrink-0 text-primary" />
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask Saturn AI anything across Finance, Calendar & Mail..."
                  aria-label="Ask Saturn AI"
                  className="h-9 rounded-none border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                />
                <Button
                  type="submit"
                  size="icon-sm"
                  aria-label="Ask AI"
                  className="size-8 shrink-0 cursor-pointer rounded-lg"
                >
                  <SendHorizontal className="size-4" />
                </Button>
              </form>

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {QUICK_PROMPTS.map((q) => (
                  <Button
                    key={q}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openAIDrawer({ prompt: q, autoSend: true })}
                    className="h-7 cursor-pointer rounded-full border-border/60 px-3 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-8 animate-in rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center duration-500 select-none fade-in slide-in-from-bottom-4">
              <Sparkles className="mx-auto h-8 w-8 text-primary" />
              <h3 className="mt-3 font-semibold text-foreground">
                Launch Your First Space
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Saturn organizes your life into isolated Spaces. Select an
                existing space from the dropdown above or click below to create
                your first space!
              </p>
              <div className="mt-4 flex justify-center">
                <Link to="/settings/spaces">
                  <Button
                    size="sm"
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)] shadow-sm hover:bg-primary/90"
                  >
                    Create Space
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
export default DashboardView
