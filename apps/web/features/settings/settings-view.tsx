import { useSearchParams } from "react-router-dom"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AccountSettings } from "./account-settings"
import { SecuritySettings } from "./security-settings"
import { PageLayout } from "@/components/ui/page-layout"
import { Settings } from "lucide-react"

type SettingsTab = "account" | "security"

export function SettingsView() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Get active tab from URL query params, default to "account"
  const activeTab = (searchParams.get("tab") as SettingsTab) || "account"

  const setActiveTab = (tab: SettingsTab) => {
    setSearchParams({ tab }, { replace: true })
  }

  return (
    <PageLayout
      title="User Settings"
      description="Manage your personal account details, avatar, and login history."
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
          value="security"
          className="mt-6 animate-in duration-200 fade-in"
        >
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
