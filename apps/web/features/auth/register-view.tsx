import { useState, type SyntheticEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "./use-auth"
import { AuthCard } from "./components/auth-card"
import { FormInput } from "./components/form-input"
import { Button } from "@/components/ui/button"

export function RegisterView() {
  const { register, error, setError } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({})

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    const errors: { [key: string]: string } = {}
    if (!name.trim()) {
      errors.name = "Full name is required"
    }
    if (!username.trim()) {
      errors.username = "Username is required"
    }
    if (!email.trim()) {
      errors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = "Please enter a valid email address"
    }
    if (!password) {
      errors.password = "Password is required"
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters"
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      await register({
        name,
        username,
        email,
        password,
        avatarUrl: "", // optional
      })
      navigate("/")
    } catch {
      // Error is caught and stored in the AuthContext error state
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthCard title="Get started" subtitle="Create your Saturn account today">
      <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
        {error && (
          <div className="animate-in rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive duration-300 fade-in">
            {error}
          </div>
        )}

        <FormInput
          id="name"
          type="text"
          label="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          disabled={isSubmitting}
        />

        <FormInput
          id="username"
          type="text"
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErrors.username}
          disabled={isSubmitting}
        />

        <FormInput
          id="email"
          type="email"
          label="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
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
          className="mt-2 w-full cursor-pointer rounded-2xl py-6 font-semibold shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating account..." : "Create Account"}
        </Button>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-primary hover:underline focus:outline-none"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}
