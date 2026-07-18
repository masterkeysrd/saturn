import { Outlet } from "react-router-dom"

export function AuthLayout() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background p-6 select-none selection:bg-primary/20">
      {/* Dynamic Background Gradients */}
      <div className="absolute top-0 right-0 bottom-0 left-0 -z-50 flex items-center justify-center">
        <div className="absolute top-1/4 left-1/4 h-[35rem] w-[35rem] animate-pulse rounded-full bg-primary/10 blur-[120px] duration-[8000ms] dark:bg-primary/5" />
        <div className="absolute right-1/4 bottom-1/4 h-[35rem] w-[35rem] animate-pulse rounded-full bg-accent/10 blur-[120px] duration-[10000ms] dark:bg-accent/5" />
      </div>

      {/* Decorative branding element */}
      <div className="absolute top-8 left-8 flex items-center space-x-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-accent text-white shadow-lg shadow-primary/25">
          <span className="font-mono text-xl font-bold">S</span>
        </div>
        <span className="font-sans text-lg font-bold tracking-tight text-foreground">
          Saturn
        </span>
      </div>

      {/* Centered content outlet */}
      <div className="flex w-full items-center justify-center">
        <Outlet />
      </div>
    </div>
  )
}
