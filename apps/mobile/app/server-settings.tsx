import { useState, useMemo } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native"
import { useRouter, Stack } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Globe, X } from "lucide-react-native"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ServerSettingsSchema,
  type ServerSettingsFormValues,
} from "@saturn/schemas"
import { useI18n } from "@saturn/hooks"
import { useAuth } from "@/lib/auth-context"
import { DEFAULT_SERVER_URL } from "@/lib/config"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

export default function ServerSettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { serverUrl, updateServerUrl } = useAuth()
  const [saving, setSaving] = useState(false)

  const serverValues = useMemo(
    () => ({
      serverUrl: serverUrl || DEFAULT_SERVER_URL,
    }),
    [serverUrl]
  )

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<ServerSettingsFormValues>({
    resolver: zodResolver(ServerSettingsSchema),
    defaultValues: serverValues,
    values: serverValues,
    resetOptions: { keepDirtyValues: true },
  })

  const onValid = async (values: ServerSettingsFormValues) => {
    setSaving(true)
    try {
      haptics.light()
      const previousUrl = serverUrl
      const appliedUrl = await updateServerUrl(values.serverUrl.trim())
      haptics.success()
      toast.show({
        type: "success",
        title: t("settings.server.updatedToast"),
        message: t("settings.server.connectedToast", { url: appliedUrl }),
      })
      if (appliedUrl !== previousUrl) {
        router.replace("/(auth)/login")
      } else {
        router.back()
      }
    } catch (err: unknown) {
      haptics.error()
      const msg =
        err instanceof Error
          ? err.message
          : t("settings.server.updatedFailedDefault")
      setError("serverUrl", { message: msg })
      toast.show({
        type: "error",
        title: t("menu.updateFailed"),
        message: msg,
      })
    } finally {
      setSaving(false)
    }
  }

  const isPending = saving || isSubmitting

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: t("settings.hub.title"),
          headerTitleAlign: "center",
          headerBackVisible: false,
          ...(Platform.OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "button",
                    label: t("common.close"),
                    icon: { type: "sfSymbol", name: "xmark" },
                    onPress: () => {
                      haptics.light()
                      router.back()
                    },
                  },
                ],
                unstable_headerRightItems: () => [
                  isPending
                    ? {
                        type: "custom",
                        hidesSharedBackground: true,
                        element: (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                        ),
                      }
                    : {
                        type: "button",
                        label: t("common.save"),
                        variant: "done",
                        onPress: () => handleSubmit(onValid)(),
                      },
                ],
              }
            : {
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => {
                      haptics.light()
                      router.back()
                    }}
                    style={styles.headerBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={t("common.close")}
                  >
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                ),
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => handleSubmit(onValid)()}
                    disabled={isPending}
                    style={[
                      styles.headerSaveBtn,
                      isPending && { opacity: 0.6 },
                    ]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={t("settings.server.saveAria")}
                  >
                    {isPending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.headerSaveBtnText}>
                        {t("common.save")}
                      </Text>
                    )}
                  </TouchableOpacity>
                ),
              }),
        }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 20) + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>
              {t("settings.server.sectionHeader").toUpperCase()}
            </Text>
            <Card style={styles.card}>
              <TextInput
                control={control}
                name="serverUrl"
                label={t("settings.server.serverUrlLabel")}
                placeholder={DEFAULT_SERVER_URL}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                leftIcon={<Globe size={18} color={colors.primary} />}
              />
              <Text style={styles.fieldHint}>
                {t("settings.server.fieldHint")}
              </Text>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    paddingHorizontal: 4,
    letterSpacing: 0.8,
  },
  card: {
    padding: 16,
    gap: 10,
  },
  fieldHint: {
    fontSize: 12,
    color: t.colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  headerBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  headerSaveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerSaveBtnText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: t.colors.primary,
  },
})
