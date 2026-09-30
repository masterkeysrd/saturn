import { useState, type FormEvent } from "react"
import {
  useChangePasswordMutation,
  useListMFAFactorsQuery,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import { useAuth } from "@/features/auth/use-auth"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { InputOTP } from "@/components/ui/input-otp"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  KeyRoundIcon,
  ShieldCheckIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  LockIcon,
  ChevronUpIcon,
} from "lucide-react"

export function ChangePasswordSettings() {
  const { updateAccessToken } = useAuth()
  const { data: mfaData } = useListMFAFactorsQuery({})
  const changePasswordMutation = useChangePasswordMutation()

  const [isExpanded, setIsExpanded] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true)

  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Step-Up Security Challenge Modal State
  const [challengeModalOpen, setChallengeModalOpen] = useState(false)
  const [totpCode, setTotpCode] = useState("")
  const [challengeError, setChallengeError] = useState<string | null>(null)

  const factors = mfaData?.factors || []
  const hasActiveMFA = factors.length > 0

  const handleResetForm = () => {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setTotpCode("")
    setError(null)
    setChallengeError(null)
    setSuccess(false)
    setShowCurrent(false)
    setShowNew(false)
    setShowConfirm(false)
  }

  const handleToggleExpand = () => {
    if (isExpanded) {
      handleResetForm()
      setIsExpanded(false)
    } else {
      setIsExpanded(true)
    }
  }

  const executeChangePassword = async (codeToSubmit: string) => {
    try {
      const res = await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
        totpCode: codeToSubmit,
        revokeOtherSessions,
      })

      if (res?.accessToken) {
        updateAccessToken(res.accessToken)
      }

      handleResetForm()
      setSuccess(true)
      setChallengeModalOpen(false)
      setIsExpanded(false)

      toast.add({
        type: "success",
        title: "Password Changed",
        description: revokeOtherSessions
          ? "Your password has been changed. All other sessions have been signed out."
          : "Your password has been changed successfully.",
      })
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to change password"

      if (challengeModalOpen || hasActiveMFA) {
        setChallengeError(msg)
      } else {
        setError(msg)
      }

      toast.add({
        type: "error",
        title: "Password Change Failed",
        description: msg,
      })
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!currentPassword) {
      setError("Please enter your current password.")
      return
    }
    if (!newPassword) {
      setError("Please enter your new password.")
      return
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.")
      return
    }
    if (newPassword === currentPassword) {
      setError("New password cannot be the same as your current password.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.")
      return
    }

    // If account has MFA enabled, prompt for step-up verification challenge
    if (hasActiveMFA) {
      setTotpCode("")
      setChallengeError(null)
      setChallengeModalOpen(true)
      return
    }

    // Otherwise, execute directly
    await executeChangePassword("")
  }

  const handleChallengeConfirm = async () => {
    setChallengeError(null)
    if (!totpCode || totpCode.trim().length !== 6) {
      setChallengeError("Please enter a valid 6-digit verification code.")
      return
    }
    await executeChangePassword(totpCode.trim())
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <KeyRoundIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">
                Account Password
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-500">
                <ShieldCheckIcon className="h-3 w-3" />
                Protected
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your master login credentials and authorized session
              invalidation.
            </p>
          </div>
        </div>

        <Button
          variant={isExpanded ? "ghost" : "outline"}
          size="sm"
          onClick={handleToggleExpand}
          className="cursor-pointer self-start sm:self-center"
        >
          {isExpanded ? (
            <>
              <ChevronUpIcon className="mr-1.5 h-4 w-4" />
              Cancel
            </>
          ) : (
            <>
              <LockIcon className="mr-1.5 h-3.5 w-3.5" />
              Change Password
            </>
          )}
        </Button>
      </div>

      {/* Success Notification Banner */}
      {success && !isExpanded && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-green-500/30 bg-green-500/10 p-3.5 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2Icon className="h-4 w-4 shrink-0" />
          <span>Your password was successfully updated and secured.</span>
        </div>
      )}

      {/* Collapsed Preview Status */}
      {!isExpanded && !success && (
        <div className="mt-5 flex items-center justify-between border-t border-border/30 pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2.5 font-mono text-sm tracking-widest text-foreground/70">
            ••••••••••••••••
          </div>
          <span className="text-xs text-muted-foreground">
            {hasActiveMFA
              ? "Re-authentication & 2FA challenge required to modify"
              : "Re-authentication required to modify"}
          </span>
        </div>
      )}

      {/* Expanded Password Change Form */}
      {isExpanded && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 max-w-xl animate-in space-y-5 border-t border-border/40 pt-5 duration-200 fade-in"
        >
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Password */}
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current Password</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => setShowCurrent(!showCurrent)}
              >
                {showCurrent ? (
                  <EyeOffIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min. 8 characters)"
                autoComplete="new-password"
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? (
                  <EyeOffIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Must be at least 8 characters and differ from your current
              password.
            </p>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? (
                  <EyeOffIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Revoke other sessions checkbox */}
          <div className="flex items-start gap-3 pt-2">
            <Checkbox
              id="revoke-other-sessions"
              checked={revokeOtherSessions}
              onCheckedChange={(checked) => setRevokeOtherSessions(!!checked)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label
                htmlFor="revoke-other-sessions"
                className="cursor-pointer text-sm font-medium text-foreground"
              >
                Sign out of all other devices
              </Label>
              <p className="text-xs text-muted-foreground">
                Immediately invalidates any other active web, mobile, or desktop
                sessions. You will stay signed in on this current browser.
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center gap-3 pt-3">
            <Button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="cursor-pointer"
            >
              {changePasswordMutation.isPending ? (
                <>
                  <RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />
                  Updating Password...
                </>
              ) : hasActiveMFA ? (
                "Continue to Verification"
              ) : (
                "Save New Password"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleToggleExpand}
              disabled={changePasswordMutation.isPending}
              className="cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Step-Up Security Verification Modal (Option B Challenge Dialog) */}
      <Dialog open={challengeModalOpen} onOpenChange={setChallengeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <ShieldCheckIcon className="h-5 w-5" />
              </div>
              <div className="text-left">
                <DialogTitle>Security Verification Required</DialogTitle>
                <DialogDescription>
                  Enter the 6-digit code from your authenticator app to
                  authorize this password change.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {challengeError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              {challengeError}
            </div>
          )}

          <div className="flex flex-col items-center justify-center space-y-4 py-4">
            <div className="w-full space-y-2 text-center">
              <Label
                htmlFor="step-up-totp"
                className="text-xs font-medium text-foreground"
              >
                Two-Factor Authenticator Code
              </Label>
              <InputOTP
                id="step-up-totp"
                value={totpCode}
                onChange={(val) => {
                  setTotpCode(val)
                  if (challengeError) setChallengeError(null)
                }}
                onComplete={(val) => {
                  setTotpCode(val)
                  executeChangePassword(val)
                }}
                disabled={changePasswordMutation.isPending}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setChallengeModalOpen(false)}
              disabled={changePasswordMutation.isPending}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleChallengeConfirm}
              disabled={
                changePasswordMutation.isPending || totpCode.trim().length !== 6
              }
              className="cursor-pointer"
            >
              {changePasswordMutation.isPending ? (
                <>
                  <RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Authorize & Update"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
