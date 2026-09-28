import { useState, useEffect, type SyntheticEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "./use-auth"
import { AuthCard } from "./components/auth-card"
import { FormInput } from "./components/form-input"
import { Button } from "@/components/ui/button"
import { InputOTP } from "@/components/ui/input-otp"
import type { MfaFactorDescriptor } from "@saturn/api/gen/saturn/identity/v1/identity"
import { KeyRoundIcon, SmartphoneIcon, ArrowLeftIcon } from "lucide-react"

export function LoginView() {
  useEffect(() => {
    document.title = "Login | Saturn"
  }, [])

  const { login, error, setError } = useAuth()
  const navigate = useNavigate()

  // Step 1: Identifier & Password
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")

  // Step 2: MFA Challenge
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaTicket, setMfaTicket] = useState("")
  const [availableFactors, setAvailableFactors] = useState<
    MfaFactorDescriptor[]
  >([])
  const [selectedFactorId, setSelectedFactorId] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [backupCode, setBackupCode] = useState("")
  const [useBackupCode, setUseBackupCode] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({})

  const handlePasswordSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const errors: { [key: string]: string } = {}
    if (!identifier.trim()) {
      errors.identifier = "Username or email is required"
    }
    if (!password) {
      errors.password = "Password is required"
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await login({
        userPassword: {
          identifier,
          password,
        },
      })

      if (res.mfa) {
        setMfaTicket(res.mfa.ticket || "")
        const factors = res.mfa.availableFactors || []
        setAvailableFactors(factors)
        const primary = factors.find((f) => f.isPrimary) || factors[0]
        setSelectedFactorId(primary?.factorId || "")
        setMfaStep(true)
        return
      }

      navigate("/")
    } catch {
      // Error handled by AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitMfa = async (codeToVerify?: string) => {
    setError(null)
    setFieldErrors({})

    const code = codeToVerify ?? (useBackupCode ? backupCode : totpCode)
    const errors: { [key: string]: string } = {}
    if (useBackupCode) {
      if (!code.trim()) {
        errors.backupCode = "Backup recovery code is required"
      }
    } else {
      if (!code.trim() || code.trim().length !== 6) {
        errors.totpCode = "Please enter a valid 6-digit verification code"
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      await login({
        mfaAssertion: {
          mfaTicket,
          factorId: useBackupCode ? "recovery" : selectedFactorId,
          totpCode: useBackupCode ? undefined : code.trim(),
          backupCode: useBackupCode ? code.trim() : undefined,
        },
      })
      navigate("/")
    } catch {
      // Error handled by AuthContext
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMfaSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    await submitMfa()
  }

  const handleBackToLogin = () => {
    setMfaStep(false)
    setMfaTicket("")
    setTotpCode("")
    setBackupCode("")
    setUseBackupCode(false)
    setError(null)
    setFieldErrors({})
  }

  if (mfaStep) {
    return (
      <AuthCard
        title="Two-Factor Authentication"
        subtitle={
          useBackupCode
            ? "Enter an 8-character single-use recovery code"
            : "Enter the 6-digit code from your authenticator app"
        }
      >
        <form onSubmit={handleMfaSubmit} className="flex flex-col space-y-5">
          {error && (
            <div className="animate-in rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive duration-300 fade-in">
              {error}
            </div>
          )}

          {!useBackupCode ? (
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-1 text-center">
                <label
                  htmlFor="totpCode"
                  className="text-xs font-medium text-foreground"
                >
                  6-Digit Verification Code
                </label>
                <p className="text-xs text-muted-foreground">
                  Enter the code displayed in your authenticator app.
                </p>
              </div>

              <InputOTP
                id="totpCode"
                value={totpCode}
                onChange={(val) => {
                  setTotpCode(val)
                  if (fieldErrors.totpCode) {
                    setFieldErrors((prev) => {
                      const next = { ...prev }
                      delete next.totpCode
                      return next
                    })
                  }
                }}
                onComplete={(val) => {
                  setTotpCode(val)
                  submitMfa(val)
                }}
                disabled={isSubmitting}
                autoFocus
                error={fieldErrors.totpCode}
              />

              {availableFactors.length > 1 && (
                <div className="mt-3 flex flex-col items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    Enrolled device:
                  </span>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {availableFactors.map((f) => (
                      <button
                        key={f.factorId}
                        type="button"
                        onClick={() => setSelectedFactorId(f.factorId || "")}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors ${
                          selectedFactorId === f.factorId
                            ? "bg-primary font-medium text-primary-foreground"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <SmartphoneIcon className="h-3 w-3" />
                        {f.name || "Authenticator"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <FormInput
              id="backupCode"
              type="text"
              label="Backup Recovery Code"
              placeholder="ABCD-EFGH"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
              error={fieldErrors.backupCode}
              disabled={isSubmitting}
              className="text-center font-mono tracking-wider uppercase"
            />
          )}

          <Button
            type="submit"
            className="w-full cursor-pointer rounded-2xl py-6 font-semibold shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Verifying..." : "Verify & Sign In"}
          </Button>

          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setUseBackupCode(!useBackupCode)
                setError(null)
                setFieldErrors({})
              }}
              className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <KeyRoundIcon className="h-3.5 w-3.5" />
              {useBackupCode
                ? "Use an authenticator app code instead"
                : "Can't access your phone? Use a recovery code"}
            </button>

            <button
              type="button"
              onClick={handleBackToLogin}
              className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Back to username & password
            </button>
          </div>
        </form>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your Saturn account">
      <form onSubmit={handlePasswordSubmit} className="flex flex-col space-y-5">
        {error && (
          <div className="animate-in rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive duration-300 fade-in">
            {error}
          </div>
        )}

        <FormInput
          id="identifier"
          type="text"
          label="Username or Email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={fieldErrors.identifier}
          disabled={isSubmitting}
        />

        <FormInput
          id="password"
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={isSubmitting}
        />

        <Button
          type="submit"
          className="w-full cursor-pointer rounded-2xl py-6 font-semibold shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in..." : "Sign In"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-primary hover:underline focus:outline-none"
          >
            Create one
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}
