import { ActiveSessionsSettings } from "./components/active-sessions-settings"
import { TrustedDevicesSettings } from "./components/trusted-devices-settings"

export function SessionsDevicesSettingsView() {
  return (
    <div className="animate-in space-y-6 duration-200 fade-in">
      <ActiveSessionsSettings />
      <TrustedDevicesSettings />
    </div>
  )
}
