import { useState } from "react"
import { Link } from "react-router-dom"
import {
  CATEGORICAL_PALETTE,
  lightColors,
  darkColors,
  concentricRadii,
} from "@saturn/tokens"
import { TimezoneProvider } from "@saturn/hooks"
import { SaturnMark } from "@/components/ui/saturn-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AmountInput } from "@/components/ui/amount-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FormDrawer, FormFieldItem } from "@/components/ui/form-drawer"
import { MoneyAmount } from "@/components/ui/money-amount"
import {
  DocumentPage,
  SplitWorkspacePage,
  StudioCanvasPage,
} from "@/components/ui/page-shells"
import {
  ArrowLeft,
  Check,
  Palette,
  Plus,
  Sparkles,
  Sun,
  Moon,
  Wallet,
} from "lucide-react"

function TokenSpecimen({ mode }: { mode: "light" | "dark" }) {
  const [amount, setAmount] = useState("1240.50")
  const [drawerLimit, setDrawerLimit] = useState("650.00")
  const [accountType, setAccountType] = useState("checking")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const palette = mode === "light" ? lightColors : darkColors

  return (
    <div
      className={
        mode === "light"
          ? "light rounded-2xl border border-border bg-background p-5 text-foreground shadow-sm"
          : "dark rounded-2xl border border-border bg-background p-5 text-foreground shadow-sm"
      }
    >
      <div className="mb-5 flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          {mode === "light" ? (
            <Sun className="size-4 text-amber-500" />
          ) : (
            <Moon className="size-4 text-primary" />
          )}
          <span className="text-sm font-semibold">
            {mode === "light" ? "Light Mode" : "Dark Mode"}
          </span>
        </div>
        <Badge variant="neutral" dot>
          {mode === "light" ? "Porcelain Canvas" : "Cosmos Navy"}
        </Badge>
      </div>

      <div className="space-y-6">
        {/* Surface & Brand Swatches */}
        <section className="space-y-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            Surface &amp; Brand Tokens
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              { label: "Canvas", color: palette.background },
              { label: "Surface", color: palette.surface },
              { label: "Elevated", color: palette.surfaceElevated },
              { label: "Primary", color: palette.primary },
              { label: "Iris", color: palette.brandSecondary },
              { label: "Success", color: palette.success },
            ].map((swatch) => (
              <div
                key={swatch.label}
                className="flex flex-col gap-1 rounded-lg border border-border/70 bg-card p-1.5"
              >
                <div
                  className="h-7 w-full rounded-md border border-border/50"
                  style={{ backgroundColor: swatch.color }}
                />
                <span className="truncate text-[11px] font-medium">
                  {swatch.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Typography & Tabular Numerals */}
        <section className="space-y-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            Typography &amp; Tabular MoneyAmount
          </h3>
          <Card size="sm">
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Checking Balance
                </span>
                <MoneyAmount cents={1285040} currency="USD" size="xl" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Monthly Inflow
                </span>
                <MoneyAmount
                  cents={420000}
                  currency="USD"
                  size="lg"
                  colored
                  showSign
                />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Whole Foods Market
                </span>
                <MoneyAmount
                  cents={-8420}
                  currency="USD"
                  size="md"
                  colored
                  showSign
                />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Unchanged Delta
                </span>
                <MoneyAmount cents={0} currency="USD" size="sm" colored />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Buttons */}
        <section className="space-y-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            Buttons (Concentric 8px)
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">
              <Plus className="size-3.5" />
              Primary
            </Button>
            <Button size="sm" variant="outline">
              Outline
            </Button>
            <Button size="sm" variant="secondary">
              Secondary
            </Button>
            <Button size="sm" variant="ghost">
              Ghost
            </Button>
            <Button size="sm" variant="destructive">
              Delete
            </Button>
            <Button size="xs" variant="link">
              Link
            </Button>
          </div>
        </section>

        {/* Badges */}
        <section className="space-y-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            Status Badges (6px)
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success" dot>
              Active
            </Badge>
            <Badge variant="warning" dot>
              Pending
            </Badge>
            <Badge variant="destructive" dot>
              Overdue
            </Badge>
            <Badge variant="info" dot>
              Synced
            </Badge>
            <Badge variant="neutral" dot>
              Archived
            </Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </section>

        {/* Inputs & Select */}
        <section className="space-y-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            Controls (Input, AmountInput, Select)
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormFieldItem label="Merchant name">
              <Input placeholder="Blue Bottle Coffee" />
            </FormFieldItem>
            <FormFieldItem label="Account type">
              <Select
                value={accountType}
                onValueChange={(val) => val && setAccountType(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">High-Yield Savings</SelectItem>
                  <SelectItem value="credit">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </FormFieldItem>
          </div>
          <FormFieldItem label="Amount">
            <AmountInput
              currency="USD"
              value={amount}
              onValueChange={setAmount}
            />
          </FormFieldItem>
        </section>

        {/* Tabs */}
        <section className="space-y-2.5">
          <h3 className="text-xs font-medium text-muted-foreground">
            Concentric &amp; Underline Tabs
          </h3>
          <div className="space-y-3">
            <Tabs defaultValue="expense">
              <TabsList>
                <TabsTrigger value="expense">Expense</TabsTrigger>
                <TabsTrigger value="income">Income</TabsTrigger>
                <TabsTrigger value="transfer">Transfer</TabsTrigger>
              </TabsList>
              <TabsContent
                value="expense"
                className="pt-1 text-xs text-muted-foreground"
              >
                Concentric 6px active tab inside 8px track.
              </TabsContent>
            </Tabs>

            <Tabs defaultValue="overview">
              <TabsList variant="line">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="ledger">Ledger</TabsTrigger>
                <TabsTrigger value="budgets">Budgets</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </section>

        {/* Quiet Card + Drawer Trigger */}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Wallet className="size-4 text-primary" />
              Quiet Card Surface
            </CardTitle>
            <CardDescription>
              Solid background with 1px hairline border and sticky-footer drawer
              trigger.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-between border-t border-border/60">
            <span className="text-xs text-muted-foreground">
              Radius: {concentricRadii.card}px
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDrawerOpen(true)}
            >
              Open FormDrawer
            </Button>
          </CardFooter>
        </Card>
      </div>

      <FormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Sample FormDrawer"
        description="Sticky footer with calm sentence-case field labels."
        icon={<Sparkles className="size-4 text-primary" />}
        submitLabel="Save Changes"
        onSubmit={(e) => {
          e.preventDefault()
          setDrawerOpen(false)
        }}
      >
        <FormFieldItem
          label="Budget name"
          subtext="Displayed across Finance Insights and Quick Entry."
        >
          <Input defaultValue="Groceries & Dining" />
        </FormFieldItem>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <FormFieldItem label="Currency">
            <Select defaultValue="USD">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldItem>
          <FormFieldItem label="Monthly limit">
            <AmountInput
              currency="USD"
              value={drawerLimit}
              onValueChange={setDrawerLimit}
            />
          </FormFieldItem>
        </div>
      </FormDrawer>
    </div>
  )
}

export function DesignSystemView() {
  return (
    <TimezoneProvider timezone="America/New_York" locale="en-US">
      <div className="min-h-svh bg-background text-foreground">
        <div className="mx-auto max-w-7xl space-y-8 p-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
            <div className="flex items-center gap-3">
              <SaturnMark variant="badge" size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                    Orbital Precision Workbench
                  </h1>
                  <Badge variant="info" dot>
                    Dev Only
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Side-by-side Light &amp; Dark verification for @saturn/tokens,
                  primitives, and canonical page shells.
                </p>
              </div>
            </div>
            <Link to="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="size-4" />
                Back to App
              </Button>
            </Link>
          </div>

          {/* Brand Marks & 12-Hue Categorical Palette */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <Card className="lg:col-span-5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[15px]">
                  <SaturnMark variant="mark" size="sm" decorative />
                  SaturnMark Scale
                </CardTitle>
                <CardDescription>
                  Inline vector mark replacing 350 KB raster JPEG across Web.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-4">
                {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
                  <div
                    key={size}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <SaturnMark variant="badge" size={size} />
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {size}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-7">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[15px]">
                  <Palette className="size-4 text-primary" />
                  12-Hue Categorical Palette
                </CardTitle>
                <CardDescription>
                  Balanced hues from @saturn/tokens with legacy rose alias
                  compatibility.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {CATEGORICAL_PALETTE.map((item) => (
                  <div
                    key={item.value}
                    className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5"
                  >
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: item.hex }}
                    />
                    <span className="truncate text-xs font-medium">
                      {item.label}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Side-by-Side Light & Dark Comparison Matrix */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <TokenSpecimen mode="light" />
            <TokenSpecimen mode="dark" />
          </div>

          {/* 3 Canonical Page Shells Preview */}
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Three Canonical Page Shells
              </h2>
              <p className="text-sm text-muted-foreground">
                DocumentPage, SplitWorkspacePage, and StudioCanvasPage
                composition blueprints.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* DocumentPage Preview */}
              <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                <div className="border-b border-border/60 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  1. &lt;DocumentPage /&gt;
                </div>
                <div className="h-56 overflow-hidden bg-background">
                  <DocumentPage
                    title="Budgets"
                    description="Calm scrollable reading & metrics."
                    actions={<Button size="xs">New Budget</Button>}
                    className="gap-3 p-4"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border/70 bg-card p-3 text-xs">
                        Groceries · $420 / $600
                      </div>
                      <div className="rounded-lg border border-border/70 bg-card p-3 text-xs">
                        Dining · $180 / $300
                      </div>
                    </div>
                  </DocumentPage>
                </div>
              </div>

              {/* SplitWorkspacePage Preview */}
              <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                <div className="border-b border-border/60 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  2. &lt;SplitWorkspacePage /&gt;
                </div>
                <div className="flex h-56 overflow-hidden bg-background">
                  <SplitWorkspacePage
                    toolbar={
                      <span className="text-xs font-medium">
                        Filter Bar · 12 items
                      </span>
                    }
                    listPane={
                      <div className="space-y-1.5 p-3 text-xs">
                        <div className="rounded-md bg-accent px-2.5 py-2 font-medium">
                          Whole Foods Market
                        </div>
                        <div className="rounded-md px-2.5 py-2 text-muted-foreground">
                          Blue Bottle Coffee
                        </div>
                      </div>
                    }
                    detailPane={
                      <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
                        Detail / Inspector Pane
                      </div>
                    }
                    listPaneClassName="w-1/2 md:w-1/2 lg:w-1/2"
                  />
                </div>
              </div>

              {/* StudioCanvasPage Preview */}
              <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                <div className="border-b border-border/60 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  3. &lt;StudioCanvasPage /&gt;
                </div>
                <div className="flex h-56 overflow-hidden bg-background">
                  <StudioCanvasPage
                    leading={
                      <span className="text-xs font-semibold">
                        Receipt Triage Flow
                      </span>
                    }
                    status={
                      <Badge variant="success" dot>
                        Active
                      </Badge>
                    }
                    actions={
                      <Button size="xs">
                        <Check className="size-3" />
                        Save
                      </Button>
                    }
                    inspector={
                      <div className="p-3 text-xs text-muted-foreground">
                        Inspector
                      </div>
                    }
                    inspectorClassName="w-24 lg:flex xl:w-28"
                  >
                    <div className="flex h-full items-center justify-center bg-muted/30 p-4 text-xs text-muted-foreground">
                      Full-Bleed Canvas
                    </div>
                  </StudioCanvasPage>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TimezoneProvider>
  )
}

export default DesignSystemView
