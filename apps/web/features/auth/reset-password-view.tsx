import { useState, useEffect, type SyntheticEvent } from "react"
import { useSearchParams, Link, useNavigate } from "react-router-dom"
import { AuthCard } from "./components/auth-card"
import { FormInput } from "./components/form-input"
import { Button } from "@/components/ui/button"
import {
  useValidateResetTokenMutation,
  useCompleteResetPasswordMutation,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  CheckCircle2Icon,
  AlertCircleIcon,
  ArrowLeftIcon,
  LockIcon,
} from "lucide-react"
import { useI18n } from "@saturn/hooks"

export function ResetPasswordView() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") || ""
  const navigate = useNavigate()

  const hasToken = Boolean(token.trim())
  const [username, setUsername] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(hasToken)
  const [validationError, setValidationError] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({})
  const [isSuccess, setIsSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const validateMutation = useValidateResetTokenMutation()
  const completeMutation = useCompleteResetPasswordMutation()

  useEffect(() => {
    document.title = "Reset Password | Saturn"

    if (!hasToken) {
      setValidationError(t("auth.reset.noToken"))
      return
    }

    validateMutation.mutate(
      { token },
      {
        onSuccess: (data) => {
          setUsername(data.username || "User")
          setIsValidating(false)
        },
        onError: (err) => {
          setIsValidating(false)
          setValidationError(
            err.message || t("auth.reset.linkInvalid")
          )
        },
      }
    )
  }, [token, hasToken, validateMutation, t])

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFieldErrors({})
    setSubmitError(null)

    const errors: { [key: string]: string } = {}
    if (!newPassword) {
      errors.newPassword = t("auth.reset.required")
    } else if (newPassword.length < 8) {
      errors.newPassword = t("auth.reset.minLength")
    }

    if (newPassword !== confirmPassword) {
      errors.confirmPassword = t("auth.reset.mismatch")
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    try {
      await completeMutation.mutateAsync({
        token,
        newPassword,
      })
      setIsSuccess(true)
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t("auth.reset.failed")
      setSubmitError(message)
    }
  }

  // 1. Loading state while validating token
  if (isValidating) {
    return (
      <AuthCard
        title={t("auth.reset.validatingTitle")}
        subtitle={t("auth.reset.validatingSubtitle")}
      >
        <div className="flex flex-col items-center justify-center space-y-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground">
            {t("auth.reset.checkingToken")}
          </p>
        </div>
      </AuthCard>
    )
  }

  // 2. Token invalid / expired error state
  if (validationError) {
    return (
      <AuthCard
        title={t("auth.reset.invalidTitle")}
        subtitle={t("auth.reset.invalidSubtitle")}
      >
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertCircleIcon className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">{validationError}</p>
          <div className="pt-4">
            <Link to="/login">
              <Button
                variant="outline"
                className="cursor-pointer gap-2 rounded-xl"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                {t("auth.reset.backToLogin")}
              </Button>
            </Link>
          </div>
        </div>
      </AuthCard>
    )
  }

  // 3. Success state
  if (isSuccess) {
    return (
      <AuthCard
        title={t("auth.reset.successTitle")}
        subtitle={t("auth.reset.successSubtitle")}
      >
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 text-green-500">
            <CheckCircle2Icon className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("auth.reset.successDesc")}
          </p>
          <div className="w-full pt-4">
            <Button
              onClick={() => navigate("/login")}
              className="w-full cursor-pointer rounded-xl bg-primary font-semibold text-primary-foreground"
            >
              {t("auth.signIn")}
            </Button>
          </div>
        </div>
      </AuthCard>
    )
  }

  // 4. Reset password form
  return (
    <AuthCard
      title={t("auth.reset.title")}
      subtitle={
        username
          ? t("auth.reset.subtitleFor", { username })
          : t("auth.reset.subtitle")
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <FormInput
          id="newPassword"
          label={t("auth.reset.newPassword")}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="••••••••"
          error={fieldErrors.newPassword}
          disabled={completeMutation.isPending}
          autoComplete="new-password"
        />

        <FormInput
          id="confirmPassword"
          label={t("auth.reset.confirmPassword")}
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          error={fieldErrors.confirmPassword}
          disabled={completeMutation.isPending}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          disabled={completeMutation.isPending}
          className="w-full cursor-pointer rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90"
        >
          {completeMutation.isPending ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              <span>{t("auth.reset.updating")}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <LockIcon className="h-4 w-4" />
              <span>{t("auth.reset.submit")}</span>
            </div>
          )}
        </Button>

        <div className="pt-2 text-center">
          <Link
            to="/login"
            className="inline-flex items-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="mr-1.5 h-3.5 w-3.5" />
            {t("auth.reset.backToLogin")}
          </Link>
        </div>
      </form>
    </AuthCard>
  )
}
export default ResetPasswordView
