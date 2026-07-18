import type { ReactNode } from "react"

interface AuthCardProps {
  children: ReactNode
  title: string
  subtitle: string
}

export function AuthCard({ children, title, subtitle }: AuthCardProps) {
  return (
    <div className="w-full max-w-md animate-in duration-500 ease-out zoom-in-95 fade-in">
      <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/65 p-8 shadow-2xl backdrop-blur-xl sm:p-10 dark:bg-card/45 dark:shadow-black/50">
        {/* Glow effect on background */}
        <div className="absolute -top-24 -left-24 -z-10 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-24 -bottom-24 -z-10 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />

        <div className="flex flex-col space-y-2 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}
