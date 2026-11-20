import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ChangePasswordSchema,
  MfaStepUpSchema,
  type ChangePasswordFormValues,
} from "@saturn/schemas"
import {
  useChangePasswordMutation,
  useListMFAFactorsQuery,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import { useI18n } from "@saturn/hooks"
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
  const { t } = useI18n()
  const { updateAccessToken } = useAuth()
  const { data: mfaData } = useListMFAFactorsQuery({})
  const changePasswordMutation = useChangePasswordMutation()

  const [isExpanded, setIsExpanded] = useState(false)
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

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    getValues,
    formState: { errors: formErrors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      revokeOtherSessions: true,
    },
  })

  const revokeOtherSessions =
    useWatch({ control, name: "revokeOtherSessions" }) ?? true

  const handleResetForm = () => {
    reset({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      revokeOtherSessions: true,
    })
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

  const executeChangePassword = async (
    codeToSubmit: string,
    values: ChangePasswordFormValues
  ) => {
    try {
      const res = await changePasswordMutation.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        totpCode: codeToSubmit,
        revokeOtherSessions: values.revokeOtherSessions,
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
        title: t("settings.password.toastOk"),
        description: values.revokeOtherSessions
          ? t("settings.password.toastOkDescAll")
          : t("settings.password.toastOkDesc"),
      })
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : t("settings.password.failedDefault")

      if (challengeModalOpen || hasActiveMFA) {
        setChallengeError(msg)
      } else {
        setError(msg)
      }

      toast.add({
        type: "error",
        title: t("settings.password.toastFailed"),
        description: msg,
      })
    }
  }

  const onValid = async () => {
    setError(null)
    setSuccess(false)

    // If account has MFA enabled, prompt for step-up verification challenge
    if (hasActiveMFA) {
      setTotpCode("")
      setChallengeError(null)
      setChallengeModalOpen(true)
      return
    }

    // Otherwise, execute directly
    await executeChangePassword("", getValues())
  }

  const handleChallengeConfirm = async () => {
    setChallengeError(null)
    const validation = MfaStepUpSchema.safeParse({ code: totpCode.trim() })
    if (!validation.success) {
      setChallengeError(
        validation.error.issues[0]?.message ||
          t("settings.password.invalidTotp")
      )
      return
    }
    await executeChangePassword(totpCode.trim(), getValues())
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
                {t("settings.password.title")}
              </h3>
              {hasActiveMFA && (
                <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                  <ShieldCheckIcon className="h-3 w-3" />
                  {t("settings.password.mfaProtected")}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("settings.password.desc")}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant={isExpanded ? "outline" : "default"}
          size="sm"
          className="cursor-pointer gap-2 self-start rounded-xl sm:self-center"
          onClick={handleToggleExpand}
        >
          {isExpanded ? (
            <>
              <ChevronUpIcon className="h-4 w-4" />
              {t("settings.password.btnClose")}
            </>
          ) : (
            <>
              <LockIcon className="h-4 w-4" />
              {t("settings.password.btnChange")}
            </>
          )}
        </Button>
      </div>

      {/* Success banner after password update */}
      {success && !isExpanded && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2Icon className="h-4 w-4 shrink-0" />
          <span>{t("settings.password.successBanner")}</span>
        </div>
      )}

      {/* Expandable Form Body */}
      {isExpanded && (
        <form
          onSubmit={handleSubmit(onValid)}
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
            <Label htmlFor="current-password">
              {t("settings.password.currentPassword")}
            </Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                placeholder={t("settings.password.currentPasswordPlaceholder")}
                autoComplete="current-password"
                className="pr-10"
                {...register("currentPassword")}
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
            {formErrors.currentPassword && (
              <p className="text-xs text-destructive">
                {formErrors.currentPassword.message}
              </p>
            )}
          </div>

          {/* New Password */}
          <div className="space-y-1.5">
            <Label htmlFor="new-password">
              {t("settings.password.newPassword")}
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? "text" : "password"}
                placeholder={t("settings.password.newPasswordPlaceholder")}
                autoComplete="new-password"
                className="pr-10"
                {...register("newPassword")}
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
            {formErrors.newPassword ? (
              <p className="text-xs text-destructive">
                {formErrors.newPassword.message}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {t("settings.password.newPasswordHint")}
              </p>
            )}
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">
              {t("settings.password.confirmPassword")}
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                placeholder={t("settings.password.confirmPasswordPlaceholder")}
                autoComplete="new-password"
                className="pr-10"
                {...register("confirmPassword")}
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
            {formErrors.confirmPassword && (
              <p className="text-xs text-destructive">
                {formErrors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* Revoke other sessions checkbox */}
          <div className="flex items-start gap-3 pt-2">
            <Checkbox
              id="revoke-other-sessions"
              checked={revokeOtherSessions}
              onCheckedChange={(checked) =>
                setValue("revokeOtherSessions", !!checked)
              }
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label
                htmlFor="revoke-other-sessions"
                className="cursor-pointer text-sm font-medium text-foreground"
              >
                {t("settings.password.revokeLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.password.revokeDesc")}
              </p>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center gap-3 pt-3">
            <Button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="cursor-pointer gap-2 rounded-xl"
            >
              {changePasswordMutation.isPending && (
                <RefreshCwIcon className="h-4 w-4 animate-spin" />
              )}
              {hasActiveMFA
                ? t("settings.password.btnContinue")
                : t("settings.password.btnUpdate")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleResetForm}
              disabled={changePasswordMutation.isPending}
              className="cursor-pointer rounded-xl"
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}

      {/* Step-Up MFA Challenge Modal */}
      <Dialog open={challengeModalOpen} onOpenChange={setChallengeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <ShieldCheckIcon className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">
              {t("settings.password.challengeTitle")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {t("settings.password.challengeDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {challengeError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{challengeError}</span>
              </div>
            )}

            <div className="flex justify-center">
              <InputOTP
                id="totpCode"
                value={totpCode}
                onChange={(val) => {
                  setTotpCode(val)
                  setChallengeError(null)
                }}
                onComplete={(val) => {
                  setTotpCode(val)
                  setChallengeError(null)
                }}
                disabled={changePasswordMutation.isPending}
                autoFocus
                error={challengeError || undefined}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setChallengeModalOpen(false)
                setChallengeError(null)
              }}
              disabled={changePasswordMutation.isPending}
              className="cursor-pointer rounded-xl"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleChallengeConfirm}
              disabled={
                changePasswordMutation.isPending || totpCode.trim().length !== 6
              }
              className="cursor-pointer gap-2 rounded-xl"
            >
              {changePasswordMutation.isPending && (
                <RefreshCwIcon className="h-4 w-4 animate-spin" />
              )}
              {t("settings.password.btnConfirmUpdate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
