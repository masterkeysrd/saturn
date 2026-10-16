import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { RegisterSchema, type RegisterFormValues } from "@saturn/schemas"
import { useAuth } from "./use-auth"
import { AuthCard } from "./components/auth-card"
import { FormInput } from "./components/form-input"
import { Button } from "@/components/ui/button"

export function RegisterView() {
  useEffect(() => {
    document.title = "Register | Saturn"
  }, [])

  const { register: registerAuth, error, setError } = useAuth()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      password: "",
    },
  })

  const onRegisterSubmit = async (values: RegisterFormValues) => {
    setError(null)
    setIsSubmitting(true)
    try {
      await registerAuth({
        name: values.name.trim(),
        username: values.username?.trim() || values.email.split("@")[0],
        email: values.email.trim(),
        password: values.password,
        avatarUrl: "",
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
      <form
        onSubmit={handleSubmit(onRegisterSubmit)}
        className="flex flex-col space-y-4"
      >
        {error && (
          <div className="animate-in rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive duration-300 fade-in">
            {error}
          </div>
        )}

        <FormInput
          id="name"
          type="text"
          label="Full Name"
          error={errors.name?.message}
          disabled={isSubmitting}
          {...register("name")}
        />

        <FormInput
          id="username"
          type="text"
          label="Username"
          error={errors.username?.message}
          disabled={isSubmitting}
          {...register("username")}
        />

        <FormInput
          id="email"
          type="email"
          label="Email Address"
          error={errors.email?.message}
          disabled={isSubmitting}
          {...register("email")}
        />

        <FormInput
          id="password"
          type="password"
          label="Password"
          error={errors.password?.message}
          disabled={isSubmitting}
          {...register("password")}
        />

        <Button
          type="submit"
          className="w-full cursor-pointer rounded-2xl py-6 font-semibold shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating account..." : "Create Account"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
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
