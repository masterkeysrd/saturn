import { useState } from "react"
import type { ElementType } from "react"
import { useWorkspaceFinance } from "../use-workspace-finance"
import { Button } from "@/components/ui/button"
import { Coins, Loader2, PiggyBank } from "lucide-react"
import { Label } from "@/components/ui/label"
import { useConfigureFinanceMutation } from "@/gen/saturn/finance/v1/finance"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { PageLayout } from "@/components/ui/page-layout"

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
  const { isWritable, isLoading, isNotConfigured, refetchSettings } =
    useWorkspaceFinance()

  const [setupCurrency, setSetupCurrency] = useState("USD")
  const configureMutation = useConfigureFinanceMutation()

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    await configureMutation.mutateAsync({
      baseCurrency: setupCurrency,
    })
    refetchSettings()
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
        <div className="relative w-full max-w-lg animate-in overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-8 shadow-2xl backdrop-blur-xl duration-500 fade-in slide-in-from-bottom-6 md:p-10">
          <div className="absolute top-0 right-0 -mt-16 -mr-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl"></div>

          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-accent text-white shadow-xl">
            <Coins className="h-8 w-8" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
            Configure Finance settings
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Select the base currency for this workspace. This will serve as your
            default reporting currency and cannot be changed later. All budgets
            will be automatically converted to this base currency for aggregate
            reporting.
          </p>

          <form onSubmit={handleSetup} className="mt-8 space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="baseCurrency"
                className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Base Currency
              </Label>
              <Select
                value={setupCurrency}
                onValueChange={(val) => setSetupCurrency(val || "USD")}
                disabled={!isWritable}
              >
                <SelectTrigger
                  id="baseCurrency"
                  className="!h-12 w-full rounded-xl border-border/60 bg-background/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                  <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                  <SelectItem value="DOP">DOP - Dominican Peso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={configureMutation.isPending || !isWritable}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] hover:opacity-95"
            >
              {configureMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Initialize Finance Module
            </Button>
          </form>
        </div>
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
