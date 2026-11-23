import { Outlet } from "react-router-dom"
import { SUPPORTED_UI_LOCALES } from "@saturn/i18n"
import { useI18n } from "@saturn/hooks"
import { SaturnMark } from "@/components/ui/saturn-mark"
import { setCachedUserPreferences } from "@/lib/user-preferences"

export function ConsentLayout() {
  const { locale, t } = useI18n()

  return (
    <div className="relative flex min-h-svh w-full flex-col overflow-hidden bg-background">
      {/* Subtle ambient background accents */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary/5 blur-[110px]" />
        <div className="absolute right-1/4 -bottom-32 h-96 w-96 rounded-full bg-accent/5 blur-[110px]" />
      </div>

      {/* Standalone header */}
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-6 pt-6">
        <div className="flex items-center gap-2.5">
          <SaturnMark variant="badge" size="md" />
          <span className="font-sans text-lg font-bold tracking-tight text-foreground">
            Saturn
          </span>
        </div>
        <select
          aria-label={t("settings.regional.language")}
          value={
            SUPPORTED_UI_LOCALES.some((opt) => opt.value === locale)
              ? locale
              : "en-US"
          }
          onChange={(e) => {
            setCachedUserPreferences({ locale: e.target.value })
          }}
          className="cursor-pointer rounded-lg border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
        >
          {SUPPORTED_UI_LOCALES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </header>

      {/* Spacious centered consent container */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full">
          <Outlet />
        </div>
      </main>

      <footer className="mx-auto w-full max-w-4xl px-6 pb-6 text-center text-xs text-muted-foreground/60 select-none">
        © {new Date().getFullYear()} Saturn
      </footer>
    </div>
  )
}
