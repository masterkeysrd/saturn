import { useState, useMemo } from "react"
import {
  StyleSheet,
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
import { useAuth } from "@/lib/auth-context"
import { DEFAULT_SERVER_URL } from "@/lib/config"
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

export default function ServerSettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
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
      const appliedUrl = await updateServerUrl(values.serverUrl.trim())
      haptics.success()
      toast.show({
        type: "success",
        title: "Server Updated",
        message: `Connected to ${appliedUrl}`,
      })
      router.back()
    } catch (err: unknown) {
      haptics.error()
      const msg =
        err instanceof Error ? err.message : "Failed to update server URL"
      setError("serverUrl", { message: msg })
      toast.show({
        type: "error",
        title: "Update Failed",
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
          headerTitle: "Settings",
          headerTitleAlign: "center",
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                haptics.light()
                router.back()
              }}
              style={styles.headerBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close"
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => handleSubmit(onValid)()}
              disabled={isPending}
              style={[styles.headerSaveBtn, isPending && { opacity: 0.6 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Save Server Settings"
            >
              {isPending ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text style={styles.headerSaveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          ),
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
            <Text style={styles.sectionHeader}>SELF-HOSTED ENVIRONMENT</Text>
            <Card style={styles.card}>
              <TextInput
                control={control}
                name="serverUrl"
                label="Server URL"
                placeholder={DEFAULT_SERVER_URL}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                leftIcon={<Globe size={18} color={theme.colors.primary} />}
              />
              <Text style={styles.fieldHint}>
                Specify the base URL of your Saturn instance (e.g.
                https://saturn.example.com or http://192.168.1.50:8080).
              </Text>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    fontWeight: "700",
    color: theme.colors.textMuted,
    paddingHorizontal: 4,
    letterSpacing: 0.8,
  },
  card: {
    padding: 16,
    gap: 10,
  },
  fieldHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
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
    fontWeight: "600",
    color: theme.colors.primary,
  },
})
