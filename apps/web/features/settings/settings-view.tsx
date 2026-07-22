import { useSearchParams } from "react-router-dom"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AccountSettings } from "./account-settings"
import { SpaceSettings } from "./space-settings"
import { SecuritySettings } from "./security-settings"
import { PageLayout } from "@/components/ui/page-layout"
import { Settings } from "lucide-react"

type SettingsTab = "account" | "spaces" | "security"

export function SettingsView() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Get active tab from URL query params, default to "account"
  const activeTab = (searchParams.get("tab") as SettingsTab) || "account"

  const setActiveTab = (tab: SettingsTab) => {
    // Keep 'create' query parameter if present when switching to spaces tab
    const createVal = searchParams.get("create")
    const newParams: Record<string, string> = { tab }
    if (tab === "spaces" && createVal) {
      newParams.create = createVal
    }
    setSearchParams(newParams, { replace: true })
  }

  return (
    <PageLayout
      title="Settings"
      description="Manage your personal account details, spaces, and login security."
      icon={Settings}
      className="max-w-4xl py-4"
    >
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as SettingsTab)}
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
          <TabsTrigger value="security" className="cursor-pointer">
            Security & Logins
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

        <TabsContent
          value="security"
          className="mt-6 animate-in duration-200 fade-in"
        >
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
