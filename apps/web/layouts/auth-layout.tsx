import { Outlet } from "react-router-dom"
import { Wallet, Mail, Sparkles } from "lucide-react"

export function AuthLayout() {
  return (
    <div className="grid min-h-svh w-full grid-cols-1 overflow-hidden bg-background select-none lg:grid-cols-12">
      {/* Left Column: Auth form */}
      <div className="relative col-span-1 flex flex-col justify-between p-6 md:p-10 lg:col-span-5">
        {/* Branding header */}
        <div className="flex items-center space-x-2.5">
          <img
            src="/saturn_logo.jpg"
            alt="Saturn Logo"
            className="h-9 w-9 animate-in rounded-xl object-cover shadow-md shadow-primary/25 duration-500 fade-in slide-in-from-top-4"
          />
          <span className="animate-in font-sans text-lg font-bold tracking-tight text-foreground duration-500 fade-in">
            Saturn
          </span>
        </div>

        {/* Form Container */}
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground/60 select-none lg:text-left">
          © {new Date().getFullYear()} Saturn. All rights reserved.
        </div>

        {/* Mobile background glows */}
        <div className="absolute top-0 right-0 bottom-0 left-0 -z-10 flex items-center justify-center overflow-hidden lg:hidden">
          <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-primary/5 blur-[80px]" />
          <div className="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full bg-cyan-500/5 blur-[80px]" />
        </div>
      </div>

      {/* Right Column: Premium Showcase (Only visible on large screens) */}
      <div className="relative col-span-7 hidden flex-col items-center justify-center overflow-hidden border-l border-white/10 bg-gradient-to-br from-slate-950 via-[#0b1324] to-slate-950 p-12 text-slate-100 lg:flex">
        {/* Dynamic mesh background glow */}
        <div className="absolute -top-40 -right-40 h-[40rem] w-[40rem] animate-pulse rounded-full bg-teal-500/10 blur-[130px] duration-[8000ms]" />
        <div className="absolute -bottom-40 -left-40 h-[40rem] w-[40rem] animate-pulse rounded-full bg-indigo-500/10 blur-[130px] duration-[10000ms]" />

        {/* Decorative Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] bg-[size:24px_24px]" />

        {/* Large floating Saturn icon graphic */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 opacity-[0.02] select-none">
          <img
            src="/saturn_logo.jpg"
            alt=""
            className="h-full w-full rounded-full object-contain"
          />
        </div>

        <div className="relative z-10 w-full max-w-lg space-y-12">
          {/* Tagline & Marketing Text */}
          <div className="space-y-4 text-center lg:text-left">
            <h1 className="bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
              Your Life Operating System.
            </h1>
            <p className="text-base leading-relaxed font-medium text-slate-300">
              A private, multi-tenant Life OS built to manage multi-currency
              finances, unify mail and calendar sync, and run event-driven AI
              workflows across Spaces.
            </p>
          </div>

          {/* Interactive mockup preview panel */}
          <div className="animate-in space-y-6 rounded-3xl border border-white/10 bg-[#090f1d]/75 p-6 shadow-2xl backdrop-blur-2xl duration-700 select-none slide-in-from-bottom-8">
            {/* Mockup header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
              </div>
              <span className="font-mono text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                saturn-life-os
              </span>
            </div>

            {/* Mock balance and metrics row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  <Wallet className="h-3.5 w-3.5 text-teal-400" /> Net Worth
                  (USD)
                </span>
                <p className="text-2xl font-black tracking-tight text-white tabular-nums">
                  $12,850.40
                </p>
              </div>
              <div className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  <Mail className="h-3.5 w-3.5 text-cyan-400" /> Mail &amp;
                  Calendar
                </span>
                <p className="text-2xl font-black tracking-tight text-white">
                  3 Synced
                </p>
              </div>
            </div>

            {/* Mock Budget status indicator */}
            <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Monthly Budget Pace
                </span>
                <span className="font-mono font-bold text-teal-400 tabular-nums">
                  68% ($3,400 / $5,000)
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-teal-400 to-cyan-400" />
              </div>
            </div>

            {/* Mock Spaces & Event Log */}
            <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-4 font-mono text-[11px] text-slate-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-1 text-[10px] text-slate-400">
                <span>ACTIVE SPACE: PERSONAL</span>
                <span className="flex items-center gap-1 font-bold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{" "}
                  ONLINE
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-teal-400">✓</span>
                <span>
                  Workflow <code className="text-white">Receipt Triage</code>{" "}
                  staged 2 expenses
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-teal-400">✓</span>
                <span>
                  Mail &amp; Calendar{" "}
                  <code className="text-white">Google Sync</code> up to date
                </span>
              </div>
            </div>
          </div>

          {/* Bullet points detailing value */}
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-teal-500/15 p-2 text-teal-400">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-bold text-white">
                  Multi-Currency Finances
                </h4>
                <p className="mt-0.5 text-xs text-slate-400">
                  Accounts, budgets, statement reconciliation, and live FX
                  rates.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-500/15 p-2 text-indigo-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-bold text-white">
                  Mail, Calendar &amp; AI
                </h4>
                <p className="mt-0.5 text-xs text-slate-400">
                  Unified inbox &amp; calendar sync with event-driven AI
                  workflows.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
