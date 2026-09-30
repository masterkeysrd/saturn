import { ChangePasswordSettings } from "./components/change-password-settings"
import { TwoFactorSettings } from "./components/two-factor-settings"

export function CredentialsSettingsView() {
  return (
    <div className="animate-in space-y-6 duration-200 fade-in">
      <ChangePasswordSettings />
      <TwoFactorSettings />
    </div>
  )
}
