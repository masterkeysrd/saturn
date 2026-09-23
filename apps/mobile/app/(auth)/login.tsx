import { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native"
import { Link, useRouter } from "expo-router"
import { SafeAreaView } from "react-native-safe-area-context"
import { LogIn, Lock, Mail } from "lucide-react-native"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { Card } from "@/components/ui/card"
import { Header1, Subtitle } from "@/components/ui/typography"
import { useToast } from "@/components/ui/toast"

export default function LoginScreen() {
  const router = useRouter()
  const { login } = useAuth()
  const toast = useToast()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Please enter both email and password")
      return
    }

    setLoading(true)
    setError(null)

    try {
      await login({
        userPassword: {
          identifier: email.trim(),
          password,
        },
      })
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
          <View style={styles.header}>
            <Header1 style={styles.brandTitle}>🪐 Saturn</Header1>
            <Subtitle style={styles.subtitle}>
              Sign in to your Personal Life OS
            </Subtitle>
          </View>

          <Card style={styles.formCard}>
            <TextInput
              label="Email Address"
              placeholder="user@example.com"
              value={email}
              onChangeText={(val) => {
                setEmail(val)
                if (error) setError(null)
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              leftIcon={<Mail size={18} color={theme.colors.textMuted} />}
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
})
