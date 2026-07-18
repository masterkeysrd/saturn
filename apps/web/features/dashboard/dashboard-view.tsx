import { useAuth } from "@/features/auth/use-auth"

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
    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
      <div className="max-w-md animate-in duration-500 select-none zoom-in-95 fade-in">
        {/* Branding badge */}
        <div className="mb-8 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-primary to-accent text-white shadow-xl shadow-primary/20">
            <span className="font-mono text-4xl font-extrabold">S</span>
          </div>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {getGreeting()}, {firstName}!
        </h1>

        <p className="mt-3 font-mono text-xs font-semibold tracking-wider text-muted-foreground/80 uppercase">
          {formattedDate}
        </p>

        <p className="mx-auto mt-8 max-w-xs text-sm text-muted-foreground/60">
          Welcome to your Saturn workspace. Navigate features from the sidebar
          menu to get started.
        </p>
      </div>
    </div>
  )
}
export default DashboardView
