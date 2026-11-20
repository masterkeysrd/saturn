import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSpacePermissions } from "@/features/space/use-space"
import { invalidateFinanceQueries, useI18n, useTimezone } from "@saturn/hooks"
import { useRegisterCopilotView } from "@saturn/hooks/ai"
import {
  type ExchangeRate,
  useDeleteExchangeRateMutation,
  useGetSettingsQuery,
  useListExchangeRatesQuery,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { FinancePageLayout } from "./components/finance-page-layout"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Globe, ArrowRight, Trash2 } from "lucide-react"
import { CreateRateSheet } from "./components/create-rate-sheet"

export function RatesView() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { spaceId, isWritable } = useSpacePermissions()
  const tz = useTimezone()

  useRegisterCopilotView({
    viewId: "finance.rates",
    title: t("finance.exchangeRates.copilotTitle"),
    suggestions: [
      t("finance.exchangeRates.suggestion.missingRates"),
      t("finance.exchangeRates.suggestion.rateImpact"),
      t("finance.exchangeRates.suggestion.howItWorks"),
    ],
  })

  const { data: settings } = useGetSettingsQuery({}, { enabled: !!spaceId })
  const { data: ratesData, refetch: refetchRates } = useListExchangeRatesQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!settings }
  )

  const [rateCreateOpen, setRateCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExchangeRate | null>(null)
  const deleteRateMutation = useDeleteExchangeRateMutation()

  const handleDeleteRate = (rate: ExchangeRate) => {
    setDeleteTarget(rate)
  }

  const handleConfirmDeleteRate = async () => {
    if (!deleteTarget) return
    const rateId =
      deleteTarget.id ||
      `rate_${deleteTarget.fromCurrency}_${deleteTarget.toCurrency}_${deleteTarget.rateDate.split("T")[0].replace(/-/g, "")}`
    try {
      await deleteRateMutation.mutateAsync({
        id: rateId,
        req: { id: rateId },
      })
      toast.add({
        type: "success",
        title: t("finance.exchangeRates.deletedTitle"),
        description: t("finance.exchangeRates.deletedDescription", {
          from: deleteTarget.fromCurrency,
          to: deleteTarget.toCurrency,
        }),
      })
      setDeleteTarget(null)
      await invalidateFinanceQueries(queryClient)
      refetchRates()
    } catch (err) {
      toast.add({
        type: "error",
        title: t("finance.exchangeRates.deleteFailedTitle"),
        description:
          err instanceof Error
            ? err.message
            : t("finance.exchangeRates.deleteFailedDescription"),
      })
    }
  }

  return (
    <FinancePageLayout
      title={t("finance.exchangeRates.title")}
      description={t("finance.exchangeRates.description")}
      icon={Globe}
      actions={
        isWritable && (
          <Button
            onClick={() => setRateCreateOpen(true)}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary pt-0.5 font-semibold text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)] shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
          >
            {t("finance.exchangeRates.addRate")}
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
            {t("finance.exchangeRates.currencyConfig")}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("finance.exchangeRates.reportingIntro", {
              currency: settings?.baseCurrency ?? "",
            })}
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-border/40 bg-card/45 shadow-lg backdrop-blur-xl">
          <div className="border-b border-border/40 bg-muted/20 px-6 py-4">
            <h3 className="text-md font-bold text-foreground">
              {t("finance.exchangeRates.conversionRules")}
            </h3>
          </div>

          {!ratesData?.exchangeRates || ratesData.exchangeRates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground/80 shadow-sm">
                <Globe className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-foreground">
                {t("finance.exchangeRates.emptyTitle")}
              </h4>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {t("finance.exchangeRates.emptyDescription")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {ratesData.exchangeRates.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-muted/10 sm:px-6 sm:py-4"
                >
                  {/* Left part: Currencies & Date */}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black tracking-tight text-foreground">
                        {r.fromCurrency}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-black tracking-tight text-foreground">
                        {r.toCurrency}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground/80">
                      {tz.format(r.rateDate, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  {/* Right part: Conversion rate */}
                  <div className="min-w-0 shrink-0 pr-1 text-right">
                    <span className="block text-sm font-extrabold tracking-tight text-primary sm:text-base">
                      {Number(r.rate.toFixed(6))}
                    </span>
                    <span className="block text-[8px] font-black tracking-wider text-muted-foreground/75 uppercase">
                      {t("finance.exchangeRates.perCurrency", {
                        currency: r.fromCurrency,
                      })}
                    </span>
                  </div>

                  {/* Actions: Delete */}
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("finance.exchangeRates.delete.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("finance.exchangeRates.delete.start")}{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.fromCurrency} {t("common.to")}{" "}
                {deleteTarget?.toCurrency}
              </span>
              {deleteTarget?.rateDate
                ? t("finance.exchangeRates.delete.dateSuffix", {
                    date: tz.format(deleteTarget.rateDate, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }),
                  })
                : ""}
              {t("finance.exchangeRates.delete.end")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRateMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteRateMutation.isPending}
              onClick={handleConfirmDeleteRate}
            >
              {deleteRateMutation.isPending
                ? t("finance.exchangeRates.delete.deleting")
                : t("finance.exchangeRates.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FinancePageLayout>
  )
}
