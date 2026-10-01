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

export function ResetPasswordView() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") || ""
  const navigate = useNavigate()

  const hasToken = Boolean(token.trim())
  const [username, setUsername] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(hasToken)
  const [validationError, setValidationError] = useState<string | null>(
    hasToken ? null : "No password reset token was provided."
  )

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
            err.message ||
              "This password reset link is invalid, expired, or has already been used."
          )
        },
      }
    )
  }, [token, hasToken, validateMutation])

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFieldErrors({})
    setSubmitError(null)

    const errors: { [key: string]: string } = {}
    if (!newPassword) {
      errors.newPassword = "New password is required"
    } else if (newPassword.length < 8) {
      errors.newPassword = "Password must be at least 8 characters"
    }

    if (newPassword !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match"
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
          : "Failed to reset password. Please try again or request a new link."
      setSubmitError(message)
    }
  }

  // 1. Loading state while validating token
  if (isValidating) {
    return (
      <AuthCard
        title="Validating Link"
        subtitle="Verifying your password reset link..."
      >
        <div className="flex flex-col items-center justify-center space-y-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground">
            Checking token validity...
          </p>
        </div>
      </AuthCard>
    )
  }

  // 2. Token invalid / expired error state
  if (validationError) {
    return (
      <AuthCard title="Invalid Link" subtitle="Unable to reset password">
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
                Return to Login
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
        title="Password Updated"
        subtitle="Your password has been successfully reset"
      >
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 text-green-500">
            <CheckCircle2Icon className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">
            All active sessions have been signed out. You can now log in with
            your new password.
          </p>
          <div className="w-full pt-4">
            <Button
              onClick={() => navigate("/login")}
              className="w-full cursor-pointer rounded-xl bg-primary font-semibold text-primary-foreground"
            >
              Sign In
            </Button>
          </div>
        </div>
      </AuthCard>
    )
  }

  // 4. Reset password form
  return (
    <AuthCard
      title="Reset Password"
      subtitle={
        username
          ? `Enter a new password for @${username}`
          : "Set a new secure password"
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
          label="New Password"
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
          label="Confirm Password"
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
              <span>Updating password...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <LockIcon className="h-4 w-4" />
              <span>Update Password</span>
            </div>
          )}
        </Button>

        <div className="pt-2 text-center">
          <Link
            to="/login"
            className="inline-flex items-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="mr-1.5 h-3.5 w-3.5" />
            Back to Login
          </Link>
        </div>
      </form>
    </AuthCard>
  )
}
export default ResetPasswordView
