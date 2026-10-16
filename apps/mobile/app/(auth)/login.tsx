import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  StyleSheet,
  Text,
  View,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native"
import { Link, useRouter } from "expo-router"
import { SafeAreaView } from "react-native-safe-area-context"
import {
  LogIn,
  Lock,
  User,
  Settings,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  Fingerprint,
} from "lucide-react-native"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  LoginSchema,
  MfaStepUpSchema,
  RecoveryCodeSchema,
  type LoginFormValues,
} from "@saturn/schemas"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { Card } from "@/components/ui/card"
import { OTPInput } from "@/components/ui/otp-input"
import { FormCheckboxRow } from "@/components/ui/form-primitives"
import { Header1, Subtitle } from "@/components/ui/typography"
import { useToast } from "@/components/ui/toast"
import { getRememberedIdentifier, setRememberedIdentifier } from "@/lib/storage"
import { haptics } from "@/lib/haptics"

export default function LoginScreen() {
  const router = useRouter()
  const { login, isDeviceEnrolled, biometricLabel, loginWithBiometrics } =
    useAuth()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const hasAutoPromptedRef = useRef(false)
  const isBiometricInProgressRef = useRef(false)

  // MFA Challenge State
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaTicket, setMfaTicket] = useState("")
  const [selectedFactorId, setSelectedFactorId] = useState("")
  const [useBackupCode, setUseBackupCode] = useState(false)

  // RHF Forms
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      identifier: "",
      password: "",
      rememberMe: false,
    },
  })

  const mfaSchema = useMemo(() => {
    return useBackupCode ? RecoveryCodeSchema : MfaStepUpSchema
  }, [useBackupCode])

  const mfaForm = useForm<{ code: string }>({
    resolver: zodResolver(mfaSchema),
    defaultValues: {
      code: "",
    },
  })

  // Load remembered username/email on screen mount
  useEffect(() => {
    async function loadRemembered() {
      try {
        const saved = await getRememberedIdentifier()
        if (saved) {
          loginForm.reset({
            identifier: saved,
            password: "",
            rememberMe: true,
          })
        }
      } catch {
        // Fallback silently if storage unavailable
      }
    }
    loadRemembered()
  }, [loginForm])

  const handleBiometricLogin = useCallback(async () => {
    if (isBiometricInProgressRef.current) return
    isBiometricInProgressRef.current = true
    setBiometricLoading(true)
    setError(null)
    try {
      await loginWithBiometrics()
      toast.show({
        type: "success",
        title: "Welcome back!",
        message: "Signed in with biometrics",
      })
      router.replace("/(app)/(tabs)")
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Biometric sign-in failed"
      // If user dismissed the prompt, avoid intrusive error
      if (!msg.toLowerCase().includes("cancel")) {
        setError(msg)
        toast.show({
          type: "error",
          title: "Biometric sign-in failed",
          message: msg,
        })
      }
    } finally {
      isBiometricInProgressRef.current = false
      setBiometricLoading(false)
    }
  }, [loginWithBiometrics, router, toast])

  // Offer automatic biometric prompt once when enrolled device opens
  useEffect(() => {
    let mounted = true
    if (isDeviceEnrolled && !mfaStep && !hasAutoPromptedRef.current) {
      hasAutoPromptedRef.current = true
      const timer = setTimeout(() => {
        if (mounted) {
          handleBiometricLogin()
        }
      }, 400)
      return () => {
        mounted = false
        clearTimeout(timer)
      }
    }
  }, [isDeviceEnrolled, mfaStep, handleBiometricLogin])

  const handleLogin = async (values: LoginFormValues) => {
    setLoading(true)
    setError(null)

    try {
      const res = await login({
        userPassword: {
          identifier: values.identifier.trim(),
          password: values.password,
        },
      })

      if (res.mfa) {
        setMfaTicket(res.mfa.ticket || "")
        setSelectedFactorId(res.mfa.availableFactors?.[0]?.factorId || "")
        setMfaStep(true)
        mfaForm.reset({ code: "" })
        setUseBackupCode(false)
        return
      }

      // Persist or clear remembered identifier based on toggle
      if (values.rememberMe) {
        await setRememberedIdentifier(values.identifier.trim())
      } else {
        await setRememberedIdentifier(null)
      }

      toast.show({
        type: "success",
        title: "Welcome back!",
        message: "Logged in successfully",
      })
      router.replace("/(app)/(tabs)")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in"
      setError(msg)
      toast.show({
        type: "error",
        title: "Sign in failed",
        message: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyMfa = async (values: { code: string }) => {
    const code = values.code.trim()
    setLoading(true)
    setError(null)

    try {
      await login({
        mfaAssertion: {
          mfaTicket,
          factorId: useBackupCode ? "recovery" : selectedFactorId,
          totpCode: useBackupCode ? undefined : code,
          backupCode: useBackupCode ? code : undefined,
        },
      })

      const isRemember = loginForm.getValues("rememberMe")
      const ident = loginForm.getValues("identifier")
      if (isRemember) {
        await setRememberedIdentifier(ident.trim())
      } else {
        await setRememberedIdentifier(null)
      }

      toast.show({
        type: "success",
        title: "Welcome back!",
        message: "Verified successfully",
      })
      router.replace("/(app)/(tabs)")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to verify code"
      setError(msg)
      toast.show({
        type: "error",
        title: "Verification failed",
        message: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLogin = () => {
    haptics.light()
    setMfaStep(false)
    setMfaTicket("")
    setSelectedFactorId("")
    mfaForm.reset({ code: "" })
    setUseBackupCode(false)
    setError(null)
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top right gear for server environment settings */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.serverButton}
          activeOpacity={0.7}
          onPress={() => {
            haptics.light()
            router.push("/server-settings")
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Server Settings"
        >
          <Settings size={18} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {mfaStep ? (
            <>
              {/* MFA Header */}
              <View style={styles.header}>
                <View style={[styles.logoWrapper, styles.mfaIconWrapper]}>
                  {useBackupCode ? (
                    <KeyRound size={28} color={theme.colors.primary} />
                  ) : (
                    <ShieldCheck size={28} color={theme.colors.primary} />
                  )}
                </View>
                <Header1 style={styles.brandTitle}>
                  Two-Factor Verification
                </Header1>
                <Subtitle style={styles.subtitle}>
                  {useBackupCode
                    ? "Enter an 8-character emergency recovery code"
                    : "Enter the 6-digit code from your authenticator app"}
                </Subtitle>
              </View>

              <Card style={styles.formCard}>
                {useBackupCode ? (
                  <TextInput
                    control={mfaForm.control}
                    name="code"
                    label="Recovery Code"
                    placeholder="ABCD-EFGH"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    leftIcon={
                      <KeyRound size={18} color={theme.colors.textMuted} />
                    }
                  />
                ) : (
                  <View style={styles.otpWrapper}>
                    <Text style={styles.otpLabel}>
                      6-Digit Verification Code
                    </Text>
                    <OTPInput
                      control={mfaForm.control}
                      name="code"
                      onComplete={(code) => {
                        handleVerifyMfa({ code })
                      }}
                      autoFocus
                      disabled={loading}
                      error={Boolean(error || mfaForm.formState.errors.code)}
                    />
                  </View>
                )}

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Button
                  variant="primary"
                  size="lg"
                  loading={loading}
                  onPress={mfaForm.handleSubmit(handleVerifyMfa)}
                  leftIcon={
                    <ShieldCheck
                      size={18}
                      color={theme.colors.primaryForeground}
                    />
                  }
                  style={styles.button}
                >
                  Verify & Sign In
                </Button>

                <TouchableOpacity
                  style={styles.switchModeButton}
                  activeOpacity={0.7}
                  onPress={() => {
                    haptics.selection()
                    setUseBackupCode((prev) => !prev)
                    mfaForm.reset({ code: "" })
                    setError(null)
                  }}
                >
                  <Text style={styles.switchModeText}>
                    {useBackupCode
                      ? "Use Authenticator app code instead"
                      : "Lost access to your app? Use a recovery code"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backButton}
                  activeOpacity={0.7}
                  onPress={handleBackToLogin}
                >
                  <ArrowLeft size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.backButtonText}>Back to sign in</Text>
                </TouchableOpacity>
              </Card>
            </>
          ) : (
            <>
              {/* Brand Logo & Header */}
              <View style={styles.header}>
                <View style={styles.logoWrapper}>
                  <Image
                    source={require("@/assets/saturn_logo.jpg")}
                    style={styles.logoImage}
                    resizeMode="cover"
                  />
                </View>
                <Header1 style={styles.brandTitle}>Saturn</Header1>
                <Subtitle style={styles.subtitle}>
                  Sign in to your Personal Life OS
                </Subtitle>
              </View>

              <Card style={styles.formCard}>
                {isDeviceEnrolled && (
                  <View style={styles.biometricSection}>
                    <Button
                      variant="secondary"
                      size="lg"
                      loading={biometricLoading}
                      onPress={handleBiometricLogin}
                      leftIcon={
                        <Fingerprint size={18} color={theme.colors.primary} />
                      }
                      style={styles.biometricButton}
                    >
                      {`Sign in with ${biometricLabel || "Biometrics"}`}
                    </Button>

                    <View style={styles.dividerRow}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>
                        or continue with password
                      </Text>
                      <View style={styles.dividerLine} />
                    </View>
                  </View>
                )}

                <TextInput
                  control={loginForm.control}
                  name="identifier"
                  label="Username or Email"
                  placeholder="user@example.com or username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  importantForAutofill="yes"
                  leftIcon={<User size={18} color={theme.colors.textMuted} />}
                />

                <TextInput
                  control={loginForm.control}
                  name="password"
                  label="Password"
                  placeholder="••••••••"
                  isPassword
                  autoComplete="current-password"
                  textContentType="password"
                  importantForAutofill="yes"
                  leftIcon={<Lock size={18} color={theme.colors.textMuted} />}
                />

                <FormCheckboxRow
                  control={loginForm.control}
                  name="rememberMe"
                  label="Remember me"
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Button
                  variant="primary"
                  size="lg"
                  loading={loading}
                  onPress={loginForm.handleSubmit(handleLogin)}
                  leftIcon={
                    <LogIn size={18} color={theme.colors.primaryForeground} />
                  }
                  style={styles.button}
                >
                  Sign In
                </Button>
              </Card>

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  {"Don't have an account? "}
                </Text>
                <Link href="/(auth)/register" asChild>
                  <TouchableOpacity>
                    <Text style={styles.linkText}>Create one</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  serverButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoWrapper: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
    marginBottom: 14,
    ...theme.shadows.md,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  brandTitle: {
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    textAlign: "center",
  },
  formCard: {
    padding: 20,
    gap: 16,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.destructive,
  },
  button: {
    marginTop: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  linkText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  mfaIconWrapper: {
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  switchModeButton: {
    paddingVertical: 6,
    alignItems: "center",
  },
  switchModeText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: "500",
    textAlign: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  backButtonText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  otpWrapper: {
    marginVertical: 4,
    alignItems: "center",
  },
  otpLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  biometricSection: {
    gap: 14,
    marginBottom: 4,
  },
  biometricButton: {
    borderColor: theme.colors.borderStrong,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
})
