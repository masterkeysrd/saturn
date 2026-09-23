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
import { LogIn, Lock, User, Check } from "lucide-react-native"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { Card } from "@/components/ui/card"
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
      await login({
        userPassword: {
          identifier: identifier.trim(),
          password,
        },
      })

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
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
                style={[styles.checkbox, rememberMe && styles.checkboxActive]}
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
})
