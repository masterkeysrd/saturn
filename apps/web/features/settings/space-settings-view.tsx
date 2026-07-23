import { useSearchParams } from "react-router-dom"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SpaceSettings } from "./space-settings"
import { IntegrationSettings } from "./integration-settings"
import { PageLayout } from "@/components/ui/page-layout"
import { Wrench } from "lucide-react"

type SpaceTab = "general" | "integrations"

export function SpaceSettingsView() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get("tab") as SpaceTab) || "general"

  const setActiveTab = (tab: SpaceTab) => {
    setSearchParams({ tab }, { replace: true })
  }

  return (
    <PageLayout
      title="Workspace Settings"
      description="Manage space members, configure integrations, and adjust platform rules."
      icon={Wrench}
      className="max-w-4xl py-4"
    >
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as SpaceTab)}
      >
        <TabsList
          variant="line"
          className="w-full justify-start rounded-none border-b border-border/40 pb-0.5 select-none"
        >
          <TabsTrigger value="general" className="cursor-pointer">
            General & Members
          </TabsTrigger>
          <TabsTrigger value="integrations" className="cursor-pointer">
            Integrations
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="general"
          className="mt-6 animate-in duration-200 fade-in"
        >
          <SpaceSettings />
        </TabsContent>

        <TabsContent
          value="integrations"
          className="mt-6 animate-in duration-200 fade-in"
        >
          <IntegrationSettings />
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
