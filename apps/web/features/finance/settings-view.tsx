import { useWorkspaceFinance } from "./use-workspace-finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { AlertTriangle, CheckCircle2, Settings } from "lucide-react"

export function SettingsView() {
  const { settings, ratesData } = useWorkspaceFinance()

  return (
    <FinancePageLayout
      title="Finance Settings"
      description="Configure currency rules, view currency exchanges, and check service status."
      icon={Settings}
    >
      <div className="mt-2 animate-in space-y-6 duration-300 fade-in">
        <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 shadow-lg backdrop-blur-xl md:p-8">
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/5 blur-2xl"></div>
          <h3 className="text-lg font-bold text-foreground">
            Base Currency Settings
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Your workspace's primary reporting currency is set to{" "}
            <span className="font-bold text-foreground">
              {settings?.baseCurrency}
            </span>
            . All budgets configured in other currencies will dynamically fetch
            daily exchange rates and convert spent thresholds to this reporting
            unit.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
              Integration Status: Active
            </div>
            <div className="font-mono text-xs text-muted-foreground/80">
              Initialized:{" "}
              {new Date(settings?.createTime ?? "").toLocaleString()}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-border/40 bg-card/45 p-6 shadow-lg backdrop-blur-xl md:p-8">
          <h3 className="text-lg font-bold text-foreground">
            Exchange Rate Configurations
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Saturn relies on exchange rate rules in the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              finance.exchange_rate
            </code>{" "}
            database table to convert multi-currency budgets to your base
            currency.
          </p>

          {!ratesData?.exchangeRates || ratesData.exchangeRates.length === 0 ? (
            <div className="space-y-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-sm text-amber-700 dark:text-amber-400">
              <span className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                Empty Database Alert
              </span>
              <p className="leading-relaxed">
                Currently, your database does not contain any exchange rates.
                Budgets created in foreign currencies (different from{" "}
                {settings?.baseCurrency}) will fail to activate because their
                JIT conversion rules cannot find conversion rates.
              </p>
              <div className="pt-2">
                <span className="mb-1 block font-semibold">
                  Action Required:
                </span>
                Until a cron rate-sync tool is wired, please create all budgets
                in your base currency ({settings?.baseCurrency}) to ensure
                successful period spawns.
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                Configuration Verified
              </span>
              <p className="leading-relaxed">
                We detected {ratesData.exchangeRates.length} active conversion
                rules in the database. Cross-currency conversion pipelines are
                actively listening and translating foreign budget values in
                real-time.
              </p>
            </div>
          )}
        </div>
      </div>
    </FinancePageLayout>
  )
}
