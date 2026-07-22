import { useAuth } from "@/features/auth/use-auth"
import { PageLayout } from "@/components/ui/page-layout"
import { Home } from "lucide-react"

export function DashboardView() {
  const { user } = useAuth()

  // Format today's date: e.g. "Saturday, July 18, 2026"
  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  // Get a time-based greeting: "Good morning", "Good afternoon", or "Good evening"
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const firstName = user?.name?.split(" ")[0] || "User"

  return (
    <PageLayout
      title="Dashboard"
      description="Welcome to your Saturn Life OS."
      icon={Home}
    >
      <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
        <div className="max-w-md animate-in duration-500 select-none zoom-in-95 fade-in">
          {/* Branding badge */}
          <div className="mb-8 flex animate-in justify-center duration-700 zoom-in-75">
            <img
              src="/saturn_logo.jpg"
              alt="Saturn Logo"
              className="h-20 w-20 rounded-3xl object-cover shadow-xl shadow-primary/20"
            />
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            {getGreeting()}, {firstName}!
          </h2>

          <p className="mt-3 font-mono text-xs font-semibold tracking-wider text-muted-foreground/80 uppercase">
            {formattedDate}
          </p>

          <p className="mx-auto mt-8 max-w-xs text-sm text-muted-foreground/60">
            Navigate features from the sidebar menu to manage your finances,
            schedules, and spaces.
          </p>
        </div>
      </div>
    </PageLayout>
  )
}
export default DashboardView
