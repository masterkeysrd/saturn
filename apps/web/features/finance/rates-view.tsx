import { useState } from "react"
import {
  type FinanceSettings,
  type ListExchangeRatesResponse,
  type ExchangeRate,
  useDeleteExchangeRateMutation,
} from "@/gen/saturn/finance/v1/finance"
import { Button } from "@/components/ui/button"
import { Globe, ArrowRight, Trash2 } from "lucide-react"
import { CreateRateSheet } from "./components/create-rate-sheet"

interface RatesViewProps {
  spaceId: string
  isWritable: boolean
  settings: FinanceSettings | undefined
  ratesData: ListExchangeRatesResponse | undefined
  ratesLoading: boolean
  refetchRates: () => void
}

export function RatesView({
  spaceId,
  isWritable,
  settings,
  ratesData,
  ratesLoading,
  refetchRates,
}: RatesViewProps) {
  const [rateCreateOpen, setRateCreateOpen] = useState(false)
  const deleteRateMutation = useDeleteExchangeRateMutation()

  const handleDeleteRate = async (rate: ExchangeRate) => {
    if (
      !confirm(
        `Are you sure you want to delete exchange rate for ${rate.fromCurrency} to ${rate.toCurrency} on ${new Date(rate.rateDate).toLocaleDateString()}?`
      )
    )
      return
    await deleteRateMutation.mutateAsync({
      space_id: spaceId,
      req: {
        spaceId,
        fromCurrency: rate.fromCurrency,
        toCurrency: rate.toCurrency,
        rateDate: rate.rateDate,
      },
    })
    refetchRates()
  }

  return (
    <div className="animate-in space-y-6 duration-300 fade-in">
      {isWritable && (
        <div className="mb-6 flex justify-end">
          <CreateRateSheet
            open={rateCreateOpen}
            onOpenChange={setRateCreateOpen}
            spaceId={spaceId}
            settings={settings}
            refetchRates={refetchRates}
          />
        </div>
      )}

      <div className="rounded-3xl border border-border/40 bg-card/45 p-6 shadow-lg backdrop-blur-xl md:p-8">
        <h3 className="text-lg font-bold text-foreground">
          Active Exchange Rates
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          These rates define currency conversions on specific dates. Saturn will
          use these values to compute budget periods limits dynamically.
        </p>

        {ratesLoading ? (
          <div className="mt-6 space-y-3">
            <div className="h-12 animate-pulse rounded-xl bg-muted/20"></div>
            <div className="h-12 animate-pulse rounded-xl bg-muted/20"></div>
          </div>
        ) : !ratesData?.exchangeRates ||
          ratesData.exchangeRates.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-card/15 py-16 text-center shadow-inner">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground/80">
              <Globe className="h-6 w-6" />
            </div>
            <h4 className="text-md font-bold text-foreground">
              No Exchange Rates Found
            </h4>
            <p className="mt-1 max-w-xs px-4 text-xs leading-relaxed text-muted-foreground">
              Register conversion rates to allow Saturn to resolve
              multi-currency budgeting templates.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-border/30 bg-background/25 shadow-inner">
            <table className="w-full border-collapse text-left text-sm select-none">
              <thead>
                <tr className="border-b border-border/30 bg-secondary/40 font-semibold text-muted-foreground/90">
                  <th className="p-4">Date</th>
                  <th className="p-4">Conversion Rule</th>
                  <th className="p-4">Rate</th>
                  {isWritable && <th className="p-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-foreground/80">
                {ratesData.exchangeRates.map((rate, idx) => {
                  const formattedDate = new Date(
                    rate.rateDate
                  ).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })
                  return (
                    <tr
                      key={idx}
                      className="font-medium transition-colors hover:bg-muted/15"
                    >
                      <td className="p-4 font-mono text-xs">{formattedDate}</td>
                      <td className="mt-0.5 flex items-center gap-1.5 p-4">
                        <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                          {rate.fromCurrency}
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                        <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                          {rate.toCurrency}
                        </span>
                      </td>
                      <td className="p-4 font-mono">
                        1 {rate.fromCurrency} = {rate.rate.toFixed(4)}{" "}
                        {rate.toCurrency}
                      </td>
                      {isWritable && (
                        <td className="p-4 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRate(rate)}
                            className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/15"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
