import { useSearchParams } from "react-router-dom"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AccountSettings } from "./account-settings"
import { SpaceSettings } from "./space-settings"

export function SettingsView() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Get active tab from URL query params, default to "account"
  const activeTab =
    (searchParams.get("tab") as "account" | "spaces") || "account"

  const setActiveTab = (tab: "account" | "spaces") => {
    // Keep 'create' query parameter if present when switching to spaces tab
    const createVal = searchParams.get("create")
    const newParams: Record<string, string> = { tab }
    if (tab === "spaces" && createVal) {
      newParams.create = createVal
    }
    setSearchParams(newParams, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 py-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal account details and spaces.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "account" | "spaces")}
      >
        <TabsList
          variant="line"
          className="w-full justify-start rounded-none border-b border-border/40 pb-0.5 select-none"
        >
          <TabsTrigger value="account" className="cursor-pointer">
            Account
          </TabsTrigger>
          <TabsTrigger value="spaces" className="cursor-pointer">
            Spaces
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="account"
          className="mt-6 animate-in duration-200 fade-in"
        >
          <AccountSettings />
        </TabsContent>

        <TabsContent
          value="spaces"
          className="mt-6 animate-in duration-200 fade-in"
        >
          <SpaceSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
