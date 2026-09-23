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
import { UserPlus, User, Mail, Lock, AtSign } from "lucide-react-native"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { Card } from "@/components/ui/card"
import { Header1, Subtitle } from "@/components/ui/typography"
import { useToast } from "@/components/ui/toast"

export default function RegisterScreen() {
  const router = useRouter()
  const { register } = useAuth()
  const toast = useToast()
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in all required fields")
      return
    }

    setLoading(true)
    setError(null)

    try {
      await register({
        name: name.trim(),
        username: username.trim() || email.split("@")[0],
        email: email.trim(),
        password,
        avatarUrl: "",
      })
      toast.show({
        type: "success",
        title: "Account created!",
        message: "Welcome to Saturn",
      })
      router.replace("/(app)/(tabs)")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register"
      setError(msg)
      toast.show({
        type: "error",
        title: "Registration failed",
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
            <Header1 style={styles.brandTitle}>Create Account</Header1>
            <Subtitle style={styles.subtitle}>Join Saturn Life OS</Subtitle>
          </View>

          <Card style={styles.formCard}>
            <TextInput
              label="Full Name"
              placeholder="Ada Lovelace"
              value={name}
              onChangeText={(val) => {
                setName(val)
                if (error) setError(null)
              }}
              leftIcon={<User size={18} color={theme.colors.textMuted} />}
            />

            <TextInput
              label="Username (optional)"
              placeholder="adalovelace"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              leftIcon={<AtSign size={18} color={theme.colors.textMuted} />}
            />

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
              onPress={handleRegister}
              leftIcon={
                <UserPlus size={18} color={theme.colors.primaryForeground} />
              }
              style={styles.button}
            >
              Sign Up
            </Button>
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Sign In</Text>
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
