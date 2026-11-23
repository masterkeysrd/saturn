import { useState } from "react"
import type { ElementType } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { invalidateFinanceQueries, useI18n } from "@saturn/hooks"
import {
  useGetSettingsQuery,
  useSetupMutation,
} from "@saturn/api/gen/saturn/finance/v1/finance"
import { Button } from "@/components/ui/button"
import {
  CheckCircle2,
  Coins,
  CreditCard,
  Loader2,
  PiggyBank,
  ShieldAlert,
  Target,
} from "lucide-react"
import { Label } from "@/components/ui/label"
import { PageLayout } from "@/components/ui/page-layout"
import { CurrencyCombobox } from "./currency-combobox"
import { CreateAccountSheet } from "./create-account-sheet"
import { CreateBudgetSheet } from "./create-budget-sheet"

interface FinancePageLayoutProps {
  title: string
  description: string
  children: React.ReactNode
  actions?: React.ReactNode
  icon?: ElementType
}

export function FinancePageLayout({
  title,
  description,
  children,
  actions,
  icon = PiggyBank,
}: FinancePageLayoutProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { spaceId, spaceRole } = useActiveSpaceContext()
  const isWritable =
    spaceRole === "owner" ||
    spaceRole === "admin" ||
    spaceRole === "finance_manager" ||
    spaceRole === "member"

  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useGetSettingsQuery(
    {},
    {
      enabled: !!spaceId,
      retry: false,
    }
  )

  const isLoading = settingsLoading
  const isNotConfigured = !!settingsError && !settingsLoading

  const [setupCurrency, setSetupCurrency] = useState("USD")
  const [onboardingStep, setOnboardingStep] = useState<
    "configure" | "next-steps" | "done"
  >("configure")
  const [accountSheetOpen, setAccountSheetOpen] = useState(false)
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false)

  const setupMutation = useSetupMutation()

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    await setupMutation.mutateAsync({
      baseCurrency: setupCurrency,
    })
    setOnboardingStep("next-steps")
    await invalidateFinanceQueries(queryClient)
    await refetchSettings()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (isNotConfigured) {
    return (
      <div className="flex min-h-[500px] flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Coins className="size-6" />
            </div>
            <span className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {t("finance.onboarding.stepOf", { current: 1, total: 2 })}
            </span>
          </div>

          <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {t("finance.onboarding.configureTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("finance.onboarding.configureDesc")}
          </p>

          {!isWritable ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-foreground">
                  {t("finance.onboarding.readOnlyTitle")}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed">
                  {t("finance.onboarding.readOnlyDesc")}
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSetup} className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="baseCurrency"
                  className="text-[13px] font-medium text-foreground/90"
                >
                  {t("finance.onboarding.baseCurrency")}
                </Label>
                <CurrencyCombobox
                  id="baseCurrency"
                  value={setupCurrency}
                  onValueChange={setSetupCurrency}
                  disabled={!isWritable || setupMutation.isPending}
                  aria-label={t("finance.onboarding.baseCurrency")}
                />
              </div>

              <Button
                type="submit"
                disabled={setupMutation.isPending || !isWritable}
                className="h-10 w-full cursor-pointer rounded-lg font-medium"
              >
                {setupMutation.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                {t("finance.onboarding.initialize")}
              </Button>
            </form>
          )}
        </div>
      </div>
    )
  }

  if (onboardingStep === "next-steps" && isWritable) {
    const resolvedCurrency = settings?.baseCurrency || setupCurrency
    return (
      <div className="flex min-h-[500px] flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl border border-success/20 bg-success/10 text-success">
              <CheckCircle2 className="size-6" />
            </div>
            <span className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {t("finance.onboarding.stepOf", { current: 2, total: 2 })}
            </span>
          </div>

          <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {t("finance.onboarding.readyTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("finance.onboarding.readyDesc")}{" "}
            <span className="font-mono font-medium text-foreground">
              {resolvedCurrency}
            </span>
            . {t("finance.onboarding.readyTail")}
          </p>

          <div className="mt-6 divide-y divide-border/70 border-t border-b border-border/70">
            <button
              type="button"
              onClick={() => setAccountSheetOpen(true)}
              className="flex w-full cursor-pointer items-center justify-between gap-4 py-3.5 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-control text-primary">
                  <CreditCard className="size-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {t("finance.onboarding.firstAccountTitle")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("finance.onboarding.firstAccountDesc")}
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium text-primary">
                {t("common.add")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBudgetSheetOpen(true)}
              className="flex w-full cursor-pointer items-center justify-between gap-4 py-3.5 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-control text-primary">
                  <Target className="size-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {t("finance.onboarding.firstBudgetTitle")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("finance.onboarding.firstBudgetDesc")}
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium text-primary">
                {t("common.add")}
              </span>
            </button>
          </div>

          <div className="mt-6 flex items-center justify-end">
            <Button
              type="button"
              onClick={() => setOnboardingStep("done")}
              className="h-10 cursor-pointer rounded-lg px-4 font-medium"
            >
              {t("finance.onboarding.skip")}
            </Button>
          </div>
        </div>

        {accountSheetOpen && (
          <CreateAccountSheet
            open={accountSheetOpen}
            onOpenChange={(open) => {
              setAccountSheetOpen(open)
              if (!open) {
                void invalidateFinanceQueries(queryClient)
              }
            }}
            spaceId={spaceId}
            baseCurrency={resolvedCurrency}
            editAccount={null}
            refetchAccounts={() => {
              void invalidateFinanceQueries(queryClient)
            }}
          />
        )}

        {budgetSheetOpen && (
          <CreateBudgetSheet
            open={budgetSheetOpen}
            onOpenChange={(open) => {
              setBudgetSheetOpen(open)
              if (!open) {
                void invalidateFinanceQueries(queryClient)
              }
            }}
            spaceId={spaceId}
            baseCurrency={resolvedCurrency}
            refetchBudgets={() => {
              void invalidateFinanceQueries(queryClient)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <PageLayout
      title={title}
      description={description}
      icon={icon}
      actions={actions}
    >
      {children}
    </PageLayout>
  )
}
