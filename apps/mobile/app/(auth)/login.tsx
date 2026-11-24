import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
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
import { useI18n } from "@saturn/hooks"
import { useAuth } from "@/lib/auth-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
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
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()
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
        title: t("auth.mobile.welcomeBackExclaim"),
        message: t("auth.mobile.signedInBiometrics"),
      })
      router.replace("/(app)/(tabs)")
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t("auth.mobile.biometricFailed")
      // If user dismissed the prompt, avoid intrusive error
      if (!msg.toLowerCase().includes("cancel")) {
        setError(msg)
        toast.show({
          type: "error",
          title: t("auth.mobile.biometricFailed"),
          message: msg,
        })
      }
    } finally {
      isBiometricInProgressRef.current = false
      setBiometricLoading(false)
    }
  }, [loginWithBiometrics, router, toast, t])

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
        title: t("auth.mobile.welcomeBackExclaim"),
        message: t("auth.mobile.loggedInSuccess"),
      })
      router.replace("/(app)/(tabs)")
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t("auth.mobile.signInFailed")
      setError(msg)
      toast.show({
        type: "error",
        title: t("auth.mobile.signInFailedToast"),
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
        title: t("auth.mobile.welcomeBackExclaim"),
        message: t("auth.mobile.verifiedSuccess"),
      })
      router.replace("/(app)/(tabs)")
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t("auth.mobile.verifyCodeFailed")
      setError(msg)
      toast.show({
        type: "error",
        title: t("auth.mobile.verificationFailed"),
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
          accessibilityLabel={t("settings.server.title")}
        >
          <Settings size={18} color={colors.textSecondary} />
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
                    <KeyRound size={28} color={colors.primary} />
                  ) : (
                    <ShieldCheck size={28} color={colors.primary} />
                  )}
                </View>
                <Header1 style={styles.brandTitle}>
                  {t("auth.mobile.twoFactorVerification")}
                </Header1>
                <Subtitle style={styles.subtitle}>
                  {useBackupCode
                    ? t("auth.mobile.recoveryCodeDesc")
                    : t("auth.mobile.totpCodeDesc")}
                </Subtitle>
              </View>

              <Card style={styles.formCard}>
                {useBackupCode ? (
                  <TextInput
                    control={mfaForm.control}
                    name="code"
                    label={t("auth.mobile.recoveryCode")}
                    placeholder="ABCD-EFGH"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    leftIcon={<KeyRound size={18} color={colors.textMuted} />}
                  />
                ) : (
                  <View style={styles.otpWrapper}>
                    <Text style={styles.otpLabel}>
                      {t("auth.mobile.digitCode")}
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
                    <ShieldCheck size={18} color={colors.primaryForeground} />
                  }
                  style={styles.button}
                >
                  {t("auth.mobile.verifyAndSignIn")}
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
                      ? t("auth.mobile.useAuthenticatorCode")
                      : t("auth.mobile.useRecoveryCode")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backButton}
                  activeOpacity={0.7}
                  onPress={handleBackToLogin}
                >
                  <ArrowLeft size={16} color={colors.textSecondary} />
                  <Text style={styles.backButtonText}>
                    {t("auth.mobile.backToSignIn")}
                  </Text>
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
                  {t("auth.mobile.signInTagline")}
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
                        <Fingerprint size={18} color={colors.primary} />
                      }
                      style={styles.biometricButton}
                    >
                      {t("auth.mobile.signInWith", {
                        label: biometricLabel || t("auth.mobile.biometrics"),
                      })}
                    </Button>

                    <View style={styles.dividerRow}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>
                        {t("auth.mobile.orContinueWithPassword")}
                      </Text>
                      <View style={styles.dividerLine} />
                    </View>
                  </View>
                )}

                <TextInput
                  control={loginForm.control}
                  name="identifier"
                  label={t("auth.usernameOrEmail")}
                  placeholder={t("auth.mobile.identifierPlaceholder")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  importantForAutofill="yes"
                  leftIcon={<User size={18} color={colors.textMuted} />}
                />

                <TextInput
                  control={loginForm.control}
                  name="password"
                  label={t("auth.password")}
                  placeholder="••••••••"
                  isPassword
                  autoComplete="current-password"
                  textContentType="password"
                  importantForAutofill="yes"
                  leftIcon={<Lock size={18} color={colors.textMuted} />}
                />

                <FormCheckboxRow
                  control={loginForm.control}
                  name="rememberMe"
                  label={t("auth.rememberMe")}
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Button
                  variant="primary"
                  size="lg"
                  loading={loading}
                  onPress={loginForm.handleSubmit(handleLogin)}
                  leftIcon={
                    <LogIn size={18} color={colors.primaryForeground} />
                  }
                  style={styles.button}
                >
                  {loading ? t("auth.signingIn") : t("auth.signIn")}
                </Button>
              </Card>

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  {t("auth.mobile.noAccount")}
                </Text>
                <Link href="/(auth)/register" asChild>
                  <TouchableOpacity>
                    <Text style={styles.linkText}>
                      {t("auth.createAccount")}
                    </Text>
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

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "flex-end" as const,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  serverButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center" as const,
  },
  header: {
    alignItems: "center" as const,
    marginBottom: 32,
  },
  logoWrapper: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: "hidden" as const,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    marginBottom: 14,
    ...t.shadows.md,
  },
  logoImage: {
    width: "100%" as const,
    height: "100%" as const,
  },
  brandTitle: {
    textAlign: "center" as const,
  },
  subtitle: {
    marginTop: 6,
    textAlign: "center" as const,
  },
  formCard: {
    padding: 20,
    gap: 16,
  },
  errorText: {
    fontSize: 13,
    color: t.colors.destructive,
  },
  button: {
    marginTop: 4,
  },
  footer: {
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    marginTop: 24,
  },
  footerText: {
    color: t.colors.textMuted,
    fontSize: 14,
  },
  linkText: {
    color: t.colors.primary,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  mfaIconWrapper: {
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  switchModeButton: {
    paddingVertical: 6,
    alignItems: "center" as const,
  },
  switchModeText: {
    fontSize: 13,
    color: t.colors.primary,
    fontWeight: "500" as const,
    textAlign: "center" as const,
  },
  backButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  backButtonText: {
    fontSize: 13,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  otpWrapper: {
    marginVertical: 4,
    alignItems: "center" as const,
  },
  otpLabel: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
    marginBottom: 12,
  },
  biometricSection: {
    gap: 14,
    marginBottom: 4,
  },
  biometricButton: {
    borderColor: t.colors.borderStrong,
  },
  dividerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: t.colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: t.colors.textMuted,
    fontWeight: "500" as const,
  },
})
