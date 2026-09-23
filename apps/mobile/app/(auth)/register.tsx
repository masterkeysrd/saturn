import React, { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native"
import { Link, useRouter } from "expo-router"
import { SafeAreaView } from "react-native-safe-area-context"
import { UserPlus, User, Mail, Lock } from "lucide-react-native"
import { useAuth } from "../../lib/auth-context"
import { theme } from "../../lib/theme"

export default function RegisterScreen() {
  const router = useRouter()
  const { setSessionToken } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!name || !email || !password) {
      setError("Please fill in all fields")
      return
    }

    setLoading(true)
    setError(null)

    try {
      await setSessionToken("demo_mobile_jwt_token")
      router.replace("/(app)/(tabs)")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to register")
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
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.brandTitle}>Create Account</Text>
            <Text style={styles.subtitle}>Join Saturn Life OS</Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputWrapper}>
                <User
                  size={18}
                  color={theme.colors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Ada Lovelace"
                  placeholderTextColor={theme.colors.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Mail
                  size={18}
                  color={theme.colors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="user@example.com"
                  placeholderTextColor={theme.colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Lock
                  size={18}
                  color={theme.colors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={theme.colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              <UserPlus size={18} color="#090d16" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>
                {loading ? "Creating..." : "Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>

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
    fontSize: 28,
    fontWeight: "bold",
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textMuted,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 15,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: 13,
  },
  button: {
    flexDirection: "row",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: theme.colors.primaryForeground,
    fontWeight: "600",
    fontSize: 15,
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
    fontWeight: "600",
    fontSize: 14,
  },
})
