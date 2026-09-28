import { useState } from "react"
import {
  useListMFAFactorsQuery,
  useDeleteMFAFactorMutation,
  useSetPrimaryMFAFactorMutation,
  useSetupTOTPMutation,
  useConfirmTOTPMutation,
  useRegenerateBackupCodesMutation,
  type MfaFactorDescriptor,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  SmartphoneIcon,
  KeyRoundIcon,
  Trash2Icon,
  PlusIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  RefreshCwIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP } from "@/components/ui/input-otp"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

export function TwoFactorSettings() {
  const { data, isLoading, refetch } = useListMFAFactorsQuery({})
  const deleteMutation = useDeleteMFAFactorMutation()
  const setPrimaryMutation = useSetPrimaryMFAFactorMutation()
  const setupTOTPMutation = useSetupTOTPMutation()
  const confirmTOTPMutation = useConfirmTOTPMutation()
  const regenerateMutation = useRegenerateBackupCodesMutation()

  // Setup Wizard State
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupStep, setSetupStep] = useState<"name" | "scan" | "backup_codes">(
    "name"
  )
  const [deviceName, setDeviceName] = useState("Authenticator App")
  const [stagedFactorId, setStagedFactorId] = useState("")
  const [stagedSecret, setStagedSecret] = useState("")
  const [stagedQrSvg, setStagedQrSvg] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [generatedBackupCodes, setGeneratedBackupCodes] = useState<string[]>([])
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [isCopiedKey, setIsCopiedKey] = useState(false)
  const [isCopiedCodes, setIsCopiedCodes] = useState(false)

  // Regenerate Codes State
  const [regenOpen, setRegenOpen] = useState(false)
  const [regenVerificationCode, setRegenVerificationCode] = useState("")
  const [regenError, setRegenError] = useState<string | null>(null)
  const [regenSuccessCodes, setRegenSuccessCodes] = useState<string[]>([])

  // Delete Factor State
  const [factorToDelete, setFactorToDelete] =
    useState<MfaFactorDescriptor | null>(null)

  const factors = data?.factors || []
  const hasActiveMFA = factors.length > 0
  const remainingCodes = data?.remainingBackupCodes ?? 0

  const handleStartSetup = () => {
    setDeviceName("Authenticator App")
    setSetupStep("name")
    setWizardError(null)
    setVerificationCode("")
    setGeneratedBackupCodes([])
    setSetupOpen(true)
  }

  const handleGenerateSecret = async () => {
    setWizardError(null)
    try {
      const res = await setupTOTPMutation.mutateAsync({
        name: deviceName.trim() || "Authenticator App",
      })
      setStagedFactorId(res.factorId || "")
      setStagedSecret(res.secret || "")
      setStagedQrSvg(res.qrCodeSvg || "")
      setSetupStep("scan")
    } catch (err) {
      setWizardError(
        err instanceof Error ? err.message : "Failed to initiate MFA setup"
      )
    }
  }

  const handleConfirmCode = async () => {
    setWizardError(null)
    if (!verificationCode.trim() || verificationCode.trim().length !== 6) {
      setWizardError("Please enter a valid 6-digit verification code")
      return
    }

    try {
      const res = await confirmTOTPMutation.mutateAsync({
        factorId: stagedFactorId,
        code: verificationCode.trim(),
      })

      refetch()
      if (res.backupCodes && res.backupCodes.length > 0) {
        setGeneratedBackupCodes(res.backupCodes)
        setSetupStep("backup_codes")
      } else {
        setSetupOpen(false)
      }
    } catch (err) {
      setWizardError(
        err instanceof Error ? err.message : "Invalid verification code"
      )
    }
  }

  const handleCopyKey = () => {
    navigator.clipboard.writeText(stagedSecret)
    setIsCopiedKey(true)
    setTimeout(() => setIsCopiedKey(false), 2000)
  }

  const handleCopyCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join("\n"))
    setIsCopiedCodes(true)
    setTimeout(() => setIsCopiedCodes(false), 2000)
  }

  const handleDownloadCodes = (codes: string[]) => {
    const element = document.createElement("a")
    const file = new Blob([codes.join("\n")], { type: "text/plain" })
    element.href = URL.createObjectURL(file)
    element.download = "saturn-recovery-codes.txt"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const handleDeleteFactor = async () => {
    if (!factorToDelete?.factorId) return
    try {
      await deleteMutation.mutateAsync({
        factor_id: factorToDelete.factorId,
        req: { factorId: factorToDelete.factorId },
      })
      setFactorToDelete(null)
      refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete factor")
    }
  }

  const handleSetPrimary = async (factorId: string) => {
    try {
      await setPrimaryMutation.mutateAsync({
        factor_id: factorId,
        req: { factorId: factorId },
      })
      refetch()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set primary factor")
    }
  }

  const handleRegenerateCodes = async () => {
    setRegenError(null)
    if (
      !regenVerificationCode.trim() ||
      regenVerificationCode.trim().length !== 6
    ) {
      setRegenError("Please enter a valid 6-digit verification code")
      return
    }

    try {
      const res = await regenerateMutation.mutateAsync({
        verificationCode: regenVerificationCode.trim(),
      })
      setRegenSuccessCodes(res.backupCodes || [])
      refetch()
    } catch (err) {
      setRegenError(
        err instanceof Error
          ? err.message
          : "Failed to regenerate recovery codes"
      )
    }
  }

  return (
    <div className="space-y-6">
      {/* 2FA Status Card */}
      <div className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                hasActiveMFA
                  ? "border-green-500/30 bg-green-500/10 text-green-500"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-500"
              }`}
            >
              {hasActiveMFA ? (
                <ShieldCheckIcon className="h-6 w-6" />
              ) : (
                <ShieldAlertIcon className="h-6 w-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">
                  Two-Factor Authentication (MFA)
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    hasActiveMFA
                      ? "bg-green-500/10 text-green-500"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {hasActiveMFA ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Enhance your account security by requiring an authenticator app
                code during sign-in.
              </p>
            </div>
          </div>

          <Button
            onClick={handleStartSetup}
            disabled={isLoading}
            className="shrink-0 cursor-pointer rounded-xl"
          >
            <PlusIcon className="mr-1.5 h-4 w-4" />
            {hasActiveMFA ? "Add Authenticator" : "Enable 2FA"}
          </Button>
        </div>

        {/* Factors List */}
        {hasActiveMFA && (
          <div className="mt-6 border-t border-border/40 pt-5">
            <h4 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Registered Devices & Factors
            </h4>
            <div className="divide-y divide-border/30 rounded-xl border border-border/40 bg-muted/20">
              {factors.map((f) => (
                <div
                  key={f.factorId}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-card text-foreground">
                      <SmartphoneIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {f.name || "Authenticator App"}
                        </span>
                        {f.isPrimary && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            Primary
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Time-based One-Time Password (TOTP)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!f.isPrimary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetPrimary(f.factorId || "")}
                        disabled={setPrimaryMutation.isPending}
                        className="h-8 cursor-pointer text-xs"
                      >
                        Set as primary
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFactorToDelete(f)}
                      className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-destructive"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Recovery Codes Section */}
            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border/40 bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-card text-foreground">
                  <KeyRoundIcon className="h-4 w-4" />
                </div>
                <div>
                  <h5 className="text-sm font-medium text-foreground">
                    Emergency Recovery Codes
                  </h5>
                  <p className="text-xs text-muted-foreground">
                    {remainingCodes > 0
                      ? `${remainingCodes} single-use backup recovery codes remaining.`
                      : "No backup codes remaining. Generate new codes to maintain recovery access."}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRegenVerificationCode("")
                  setRegenError(null)
                  setRegenSuccessCodes([])
                  setRegenOpen(true)
                }}
                className="shrink-0 cursor-pointer rounded-lg text-xs"
              >
                <RefreshCwIcon className="mr-1.5 h-3.5 w-3.5" />
                Regenerate Codes
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Setup Wizard Dialog */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-md">
          {setupStep === "name" && (
            <>
              <DialogHeader>
                <DialogTitle>Add Authenticator App</DialogTitle>
                <DialogDescription>
                  Give this device or authenticator app a memorable name to
                  recognize it later.
                </DialogDescription>
              </DialogHeader>

              {wizardError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {wizardError}
                </div>
              )}

              <div className="space-y-3 py-2">
                <label className="text-xs font-medium text-foreground">
                  Device Name
                </label>
                <Input
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. Personal Phone, Work Laptop"
                  disabled={setupTOTPMutation.isPending}
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSetupOpen(false)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateSecret}
                  disabled={setupTOTPMutation.isPending || !deviceName.trim()}
                  className="cursor-pointer"
                >
                  {setupTOTPMutation.isPending ? "Setting up..." : "Continue"}
                </Button>
              </DialogFooter>
            </>
          )}

          {setupStep === "scan" && (
            <>
              <DialogHeader>
                <DialogTitle>Scan Barcode</DialogTitle>
                <DialogDescription>
                  Scan this QR code in your authenticator app (e.g. Google
                  Authenticator, 1Password, Apple Passwords).
                </DialogDescription>
              </DialogHeader>

              {wizardError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {wizardError}
                </div>
              )}

              <div className="flex flex-col items-center justify-center space-y-4 py-2">
                {stagedQrSvg ? (
                  <div
                    className="flex h-44 w-44 items-center justify-center rounded-2xl bg-white p-3 shadow-md [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: stagedQrSvg }}
                  />
                ) : (
                  <div className="flex h-44 w-44 items-center justify-center rounded-2xl bg-muted/40 text-xs text-muted-foreground">
                    Loading barcode...
                  </div>
                )}

                <div className="w-full space-y-1.5 text-center">
                  <span className="text-[11px] text-muted-foreground">
                    Or enter this key manually:
                  </span>
                  <div className="flex items-center justify-center gap-2">
                    <code className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-foreground select-all">
                      {stagedSecret}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopyKey}
                      className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      {isCopiedKey ? (
                        <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <CopyIcon className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="w-full space-y-3 pt-2 text-center">
                  <label className="text-xs font-medium text-foreground">
                    Enter the 6-digit confirmation code from your app:
                  </label>
                  <InputOTP
                    value={verificationCode}
                    onChange={(val) => setVerificationCode(val)}
                    onComplete={(val) => setVerificationCode(val)}
                    disabled={confirmTOTPMutation.isPending}
                    autoFocus
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSetupStep("name")}
                  className="cursor-pointer"
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirmCode}
                  disabled={
                    confirmTOTPMutation.isPending ||
                    verificationCode.length !== 6
                  }
                  className="cursor-pointer"
                >
                  {confirmTOTPMutation.isPending
                    ? "Verifying..."
                    : "Verify & Activate"}
                </Button>
              </DialogFooter>
            </>
          )}

          {setupStep === "backup_codes" && (
            <>
              <DialogHeader>
                <DialogTitle>Save Recovery Codes</DialogTitle>
                <DialogDescription>
                  Save these single-use recovery codes in a secure password
                  manager. If you lose your phone, they are the only way to
                  recover access.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-muted/20 p-4 text-center font-mono text-sm text-foreground">
                  {generatedBackupCodes.map((code) => (
                    <div
                      key={code}
                      className="rounded border border-border/30 bg-card/60 p-1 font-semibold select-all"
                    >
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyCodes(generatedBackupCodes)}
                    className="flex-1 cursor-pointer text-xs"
                  >
                    {isCopiedCodes ? (
                      <CheckIcon className="mr-1.5 h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isCopiedCodes ? "Copied" : "Copy Codes"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadCodes(generatedBackupCodes)}
                    className="flex-1 cursor-pointer text-xs"
                  >
                    <DownloadIcon className="mr-1.5 h-3.5 w-3.5" />
                    Download (.txt)
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => setSetupOpen(false)}
                  className="w-full cursor-pointer"
                >
                  I&apos;ve Saved My Codes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Regenerate Backup Codes Dialog */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="sm:max-w-md">
          {regenSuccessCodes.length === 0 ? (
            <>
              <DialogHeader>
                <DialogTitle>Regenerate Recovery Codes</DialogTitle>
                <DialogDescription>
                  Enter a 6-digit verification code from your authenticator app.
                  All previous recovery codes will be immediately invalidated.
                </DialogDescription>
              </DialogHeader>

              {regenError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {regenError}
                </div>
              )}

              <div className="w-full space-y-3 py-2 text-center">
                <label className="text-xs font-medium text-foreground">
                  Authenticator Verification Code
                </label>
                <InputOTP
                  value={regenVerificationCode}
                  onChange={(val) => setRegenVerificationCode(val)}
                  onComplete={(val) => setRegenVerificationCode(val)}
                  disabled={regenerateMutation.isPending}
                  autoFocus
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRegenOpen(false)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRegenerateCodes}
                  disabled={
                    regenerateMutation.isPending ||
                    regenVerificationCode.length !== 6
                  }
                  className="cursor-pointer"
                >
                  {regenerateMutation.isPending
                    ? "Verifying..."
                    : "Regenerate Codes"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>New Recovery Codes</DialogTitle>
                <DialogDescription>
                  Your old codes are expired. Save these fresh single-use
                  recovery codes in a safe place.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-muted/20 p-4 text-center font-mono text-sm text-foreground">
                  {regenSuccessCodes.map((code) => (
                    <div
                      key={code}
                      className="rounded border border-border/30 bg-card/60 p-1 font-semibold select-all"
                    >
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyCodes(regenSuccessCodes)}
                    className="flex-1 cursor-pointer text-xs"
                  >
                    {isCopiedCodes ? (
                      <CheckIcon className="mr-1.5 h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isCopiedCodes ? "Copied" : "Copy Codes"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadCodes(regenSuccessCodes)}
                    className="flex-1 cursor-pointer text-xs"
                  >
                    <DownloadIcon className="mr-1.5 h-3.5 w-3.5" />
                    Download (.txt)
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => setRegenOpen(false)}
                  className="w-full cursor-pointer"
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Factor Confirmation Dialog */}
      <Dialog
        open={!!factorToDelete}
        onOpenChange={(open) => !open && setFactorToDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Authenticator Device</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove &quot;{factorToDelete?.name}
              &quot;? You will no longer be able to use this device to sign in.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFactorToDelete(null)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFactor}
              disabled={deleteMutation.isPending}
              className="cursor-pointer"
            >
              {deleteMutation.isPending ? "Removing..." : "Remove Device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
