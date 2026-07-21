import { useState } from "react"
import {
  type ExchangeRate,
  useDeleteExchangeRateMutation,
} from "@/gen/saturn/finance/v1/finance"
import { useWorkspaceFinance } from "./use-workspace-finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { Button } from "@/components/ui/button"
import { Globe, ArrowRight, Trash2 } from "lucide-react"
import { CreateRateSheet } from "./components/create-rate-sheet"

export function RatesView() {
  const { isWritable, settings, ratesData, refetchRates } =
    useWorkspaceFinance()

  const [rateCreateOpen, setRateCreateOpen] = useState(false)
  const deleteRateMutation = useDeleteExchangeRateMutation()

  const handleDeleteRate = async (rate: ExchangeRate) => {
    if (
      !confirm(
        `Are you sure you want to delete exchange rate for ${rate.fromCurrency} to ${rate.toCurrency} on ${new Date(rate.rateDate).toLocaleDateString(undefined, { timeZone: "UTC" })}?`
      )
    )
      return
    await deleteRateMutation.mutateAsync({
      fromCurrency: rate.fromCurrency,
      toCurrency: rate.toCurrency,
      rateDate: rate.rateDate,
    })
    refetchRates()
  }

  return (
    <FinancePageLayout
      title="Exchange Rates"
      description="Configure daily conversions to Reporting Currency."
      icon={Globe}
      actions={
        isWritable && (
          <Button
            onClick={() => setRateCreateOpen(true)}
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent pt-0.5 font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:scale-[1.02] hover:opacity-95"
          >
            Add Conversion Rate
          </Button>
        )
      }
    >
      <div className="mt-2 animate-in space-y-6 duration-300 fade-in">
        <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/45 p-6 shadow-lg backdrop-blur-xl md:p-8">
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-primary/5 blur-2xl"></div>
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-foreground">
            Currency Configuration
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Workspace Base Reporting Currency:{" "}
            <span className="font-bold text-foreground">
              {settings?.baseCurrency}
            </span>
            . To record expenses or set budget limits in foreign currencies, you
            must first specify the conversion rate for that day below.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border/40 bg-card/45 shadow-lg backdrop-blur-xl">
          <div className="border-b border-border/40 bg-muted/20 px-6 py-4">
            <h3 className="text-md font-bold text-foreground">
              Conversion Rules
            </h3>
          </div>

          {!ratesData?.exchangeRates || ratesData.exchangeRates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground/80 shadow-sm">
                <Globe className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-foreground">
                No Rates Registered
              </h4>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Add conversion rates to start allocating budgets in other
                currencies.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {ratesData.exchangeRates.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted/10"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-xs font-bold text-foreground">
                      {r.fromCurrency}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-xs font-bold text-foreground">
                      {r.toCurrency}
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      Multiplier:{" "}
                      <span className="font-extrabold text-primary">
                        {r.rate.toFixed(6)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs text-muted-foreground/80">
                      Rate Date:{" "}
                      {new Date(r.rateDate).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </span>
                    {isWritable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deleteRateMutation.isPending}
                        onClick={() => handleDeleteRate(r)}
                        className="h-8 w-8 shrink-0 cursor-pointer rounded-lg text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateRateSheet
        open={rateCreateOpen}
        onOpenChange={setRateCreateOpen}
        settings={settings}
        refetchRates={refetchRates}
      />
    </FinancePageLayout>
  )
}
