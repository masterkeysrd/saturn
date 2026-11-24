import { useState } from "react"
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
  UserPlus,
  User,
  Mail,
  Lock,
  AtSign,
  Settings,
} from "lucide-react-native"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { RegisterSchema, type RegisterFormValues } from "@saturn/schemas"
import { useI18n } from "@saturn/hooks"
import { useAuth } from "@/lib/auth-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/text-input"
import { Card } from "@/components/ui/card"
import { Header1, Subtitle } from "@/components/ui/typography"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

export default function RegisterScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()
  const { register } = useAuth()
  const toast = useToast()
  const [errorState, setErrorState] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterSchema),
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
        title: t("auth.mobile.accountCreated"),
        message: t("auth.mobile.welcomeToSaturn"),
      })
      router.replace("/(app)/(tabs)")
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t("auth.mobile.registerFailed")
      setErrorState(msg)
      toast.show({
        type: "error",
        title: t("auth.mobile.registrationFailed"),
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
          <View style={styles.header}>
            <View style={styles.logoWrapper}>
              <Image
                source={require("@/assets/saturn_logo.jpg")}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Header1 style={styles.brandTitle}>
              {t("auth.createAccount")}
            </Header1>
            <Subtitle style={styles.subtitle}>
              {t("auth.mobile.joinTagline")}
            </Subtitle>
          </View>

          <Card style={styles.formCard}>
            <TextInput
              control={control}
              name="name"
              label={t("auth.mobile.fullName")}
              placeholder="Ada Lovelace"
              autoComplete="name"
              textContentType="name"
              leftIcon={<User size={18} color={colors.textMuted} />}
            />

            <TextInput
              control={control}
              name="username"
              label={t("auth.mobile.usernameOptional")}
              placeholder="adalovelace"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              importantForAutofill="yes"
              leftIcon={<AtSign size={18} color={colors.textMuted} />}
            />

            <TextInput
              control={control}
              name="email"
              label={t("auth.email")}
              placeholder="user@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              importantForAutofill="yes"
              leftIcon={<Mail size={18} color={colors.textMuted} />}
            />

            <TextInput
              control={control}
              name="password"
              label={t("auth.password")}
              placeholder="••••••••"
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
              importantForAutofill="yes"
              leftIcon={<Lock size={18} color={colors.textMuted} />}
            />

            {errorState && <Text style={styles.errorText}>{errorState}</Text>}

            <Button
              variant="primary"
              size="lg"
              loading={loading || isSubmitting}
              onPress={handleSubmit(onValid)}
              leftIcon={<UserPlus size={18} color={colors.primaryForeground} />}
              style={styles.button}
            >
              {loading || isSubmitting
                ? t("auth.creatingAccount")
                : t("auth.signUp")}
            </Button>
          </Card>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t("auth.mobile.hasAccount")}</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>{t("auth.signIn")}</Text>
              </TouchableOpacity>
            </Link>
          </View>
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
})
