import { useState } from "react"
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
  UserPlus,
  User,
  Mail,
  Lock,
  AtSign,
  Settings,
} from "lucide-react-native"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { registerSchema, type RegisterFormValues } from "@saturn/schemas"
import { useAuth } from "@/lib/auth-context"
import { theme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { Card } from "@/components/ui/card"
import { Header1, Subtitle } from "@/components/ui/typography"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

export default function RegisterScreen() {
  const router = useRouter()
  const { register } = useAuth()
  const toast = useToast()
  const [errorState, setErrorState] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      password: "",
    },
  })

  const onValid = async (values: RegisterFormValues) => {
    setLoading(true)
    setErrorState(null)

    try {
      await register({
        name: values.name.trim(),
        username: values.username?.trim() || values.email.split("@")[0],
        email: values.email.trim(),
        password: values.password,
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
      setErrorState(msg)
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
          <View style={styles.header}>
            <View style={styles.logoWrapper}>
              <Image
                source={require("@/assets/saturn_logo.jpg")}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Header1 style={styles.brandTitle}>Create Account</Header1>
            <Subtitle style={styles.subtitle}>Join Saturn Life OS</Subtitle>
          </View>

          <Card style={styles.formCard}>
            <TextInput
              control={control}
              name="name"
              label="Full Name"
              placeholder="Ada Lovelace"
              autoComplete="name"
              textContentType="name"
              leftIcon={<User size={18} color={theme.colors.textMuted} />}
            />

            <TextInput
              control={control}
              name="username"
              label="Username (optional)"
              placeholder="adalovelace"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              importantForAutofill="yes"
              leftIcon={<AtSign size={18} color={theme.colors.textMuted} />}
            />

            <TextInput
              control={control}
              name="email"
              label="Email Address"
              placeholder="user@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              importantForAutofill="yes"
              leftIcon={<Mail size={18} color={theme.colors.textMuted} />}
            />

            <TextInput
              control={control}
              name="password"
              label="Password"
              placeholder="••••••••"
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
              importantForAutofill="yes"
              leftIcon={<Lock size={18} color={theme.colors.textMuted} />}
            />

            {errorState && <Text style={styles.errorText}>{errorState}</Text>}

            <Button
              variant="primary"
              size="lg"
              loading={loading || isSubmitting}
              onPress={handleSubmit(onValid)}
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
})
