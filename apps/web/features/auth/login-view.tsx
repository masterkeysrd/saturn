import { useState, useEffect, type SyntheticEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "./use-auth"
import { AuthCard } from "./components/auth-card"
import { FormInput } from "./components/form-input"
import { Button } from "@/components/ui/button"

export function LoginView() {
  useEffect(() => {
    document.title = "Login | Saturn"
  }, [])

  const { login, error, setError } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({})

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
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
      await login({
        userPassword: {
          identifier,
          password,
        },
      })
      navigate("/")
    } catch {
      // Error is caught and stored in the AuthContext error state
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your Saturn account">
      <form onSubmit={handleSubmit} className="flex flex-col space-y-5">
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
