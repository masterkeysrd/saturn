import { useState, useEffect } from "react"
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
  Check,
  Settings,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
} from "lucide-react-native"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { Card } from "@/components/ui/card"
import { OTPInput } from "@/components/ui/otp-input"
import { Header1, Subtitle } from "@/components/ui/typography"
import { useToast } from "@/components/ui/toast"
import { getRememberedIdentifier, setRememberedIdentifier } from "@/lib/storage"
import { haptics } from "@/lib/haptics"

export default function LoginScreen() {
  const router = useRouter()
  const { login } = useAuth()
  const toast = useToast()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // MFA Challenge State
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaTicket, setMfaTicket] = useState("")
  const [selectedFactorId, setSelectedFactorId] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [backupCode, setBackupCode] = useState("")
  const [useBackupCode, setUseBackupCode] = useState(false)

  // Load remembered username/email on screen mount
  useEffect(() => {
    async function loadRemembered() {
      try {
        const saved = await getRememberedIdentifier()
        if (saved) {
          setIdentifier(saved)
          setRememberMe(true)
        }
      } catch {
        // Fallback silently if storage unavailable
      }
    }
    loadRemembered()
  }, [])

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setError("Please enter your username/email and password")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await login({
        userPassword: {
          identifier: identifier.trim(),
          password,
        },
      })

      if (res.mfa) {
        setMfaTicket(res.mfa.ticket || "")
        setSelectedFactorId(res.mfa.availableFactors?.[0]?.factorId || "")
        setMfaStep(true)
        setTotpCode("")
        setBackupCode("")
        setUseBackupCode(false)
        return
      }

      // Persist or clear remembered identifier based on toggle
      if (rememberMe) {
        await setRememberedIdentifier(identifier.trim())
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

  const handleVerifyMfa = async (codeOverride?: string) => {
    const rawCode = codeOverride ?? (useBackupCode ? backupCode : totpCode)
    const code = rawCode.trim()
    if (!code) {
      setError(
        useBackupCode
          ? "Please enter your recovery code"
          : "Please enter your 6-digit verification code"
      )
      return
    }

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

      if (rememberMe) {
        await setRememberedIdentifier(identifier.trim())
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
    setTotpCode("")
    setBackupCode("")
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
                    label="Recovery Code"
                    placeholder="ABCD-EFGH"
                    value={backupCode}
                    onChangeText={(val) => {
                      setBackupCode(val)
                      if (error) setError(null)
                    }}
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
                      value={totpCode}
                      onChangeText={(val) => {
                        setTotpCode(val)
                        if (error) setError(null)
                      }}
                      onComplete={(code) => {
                        handleVerifyMfa(code)
                      }}
                      autoFocus
                      disabled={loading}
                      error={Boolean(error)}
                    />
                  </View>
                )}

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Button
                  variant="primary"
                  size="lg"
                  loading={loading}
                  onPress={() => handleVerifyMfa()}
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
                <TextInput
                  label="Username or Email"
                  placeholder="user@example.com or username"
                  value={identifier}
                  onChangeText={(val) => {
                    setIdentifier(val)
                    if (error) setError(null)
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  importantForAutofill="yes"
                  leftIcon={<User size={18} color={theme.colors.textMuted} />}
                />

                <TextInput
                  label="Password"
                  placeholder="••••••••"
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val)
                    if (error) setError(null)
                  }}
                  isPassword
                  autoComplete="current-password"
                  textContentType="password"
                  importantForAutofill="yes"
                  leftIcon={<Lock size={18} color={theme.colors.textMuted} />}
                />

                {/* Remember Username / Email Toggle */}
                <TouchableOpacity
                  style={styles.rememberRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    haptics.selection()
                    setRememberMe((prev) => !prev)
                  }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      rememberMe && styles.checkboxActive,
                    ]}
                  >
                    {rememberMe && (
                      <Check size={13} color="#090d16" strokeWidth={3} />
                    )}
                  </View>
                  <Text style={styles.rememberText}>Remember me</Text>
                </TouchableOpacity>

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Button
                  variant="primary"
                  size="lg"
                  loading={loading}
                  onPress={handleLogin}
                  leftIcon={
                    <LogIn size={18} color={theme.colors.primaryForeground} />
                  }
                  style={styles.button}
                >
                  Sign In
                </Button>
              </Card>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Don't have an account? </Text>
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
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  rememberText: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
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
})
