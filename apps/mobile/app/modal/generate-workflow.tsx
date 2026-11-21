import { useEffect, useState } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { useNavigation, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useI18n } from "@saturn/hooks"
import type { TranslationKey } from "@saturn/i18n"
import { useGenerateFlowMutation } from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { setPendingWorkflowDraft } from "@/components/workflows/workflow-draft-store"
import { Sparkles } from "lucide-react-native"

const ROLE_PILL_KEYS: Record<"default" | "fast" | "reasoning", TranslationKey> =
  {
    default: "workflows.mobile.rolePillDefault",
    fast: "workflows.mobile.rolePillFast",
    reasoning: "workflows.mobile.rolePillReasoning",
  }

export default function GenerateWorkflowModalScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { t } = useI18n()
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [prompt, setPrompt] = useState("")
  const [role, setRole] = useState<"default" | "fast" | "reasoning">("default")
  const generateMutation = useGenerateFlowMutation()

  useEffect(() => {
    navigation.setOptions({
      headerTitle: t("workflows.mobile.generateWorkflowTitle"),
    })
  }, [navigation, t])

  const handleGenerate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    try {
      haptics.light()
      const flow = await generateMutation.mutateAsync({
        prompt: trimmed,
        model: { role },
      })
      setPendingWorkflowDraft(flow)
      haptics.success()
      if (router.canDismiss()) {
        router.dismiss()
      }
      router.push("/(app)/workflows/new" as never)
    } catch (err) {
      haptics.error()
      toast.show({
        title:
          err instanceof Error ? err.message : t("workflows.generateFailed"),
        type: "error",
      })
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 20) + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Sparkles size={20} color={colors.primary} />
          <Text style={styles.title}>
            {t("workflows.mobile.buildWithAITitle")}
          </Text>
        </View>
        <Text style={styles.subtitle}>
          {t("workflows.mobile.buildWithAISubtitle")}
        </Text>

        <TextInput
          style={styles.input}
          multiline
          value={prompt}
          onChangeText={setPrompt}
          placeholder={t("workflows.mobile.generatePromptPlaceholder")}
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={isDark ? "dark" : "light"}
        />

        <View style={styles.roleRow}>
          {(["default", "fast", "reasoning"] as const).map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.rolePill, role === r && styles.rolePillActive]}
              onPress={() => {
                haptics.selection()
                setRole(r)
              }}
            >
              <Text
                style={[styles.roleText, role === r && styles.roleTextActive]}
              >
                {t(ROLE_PILL_KEYS[r])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button
          onPress={handleGenerate}
          loading={generateMutation.isPending}
          disabled={!prompt.trim()}
          leftIcon={<Sparkles size={16} color={colors.primaryForeground} />}
        >
          {t("workflows.mobile.generateDraft")}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: t.colors.textSecondary,
  },
  input: {
    minHeight: 130,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    padding: 14,
    fontSize: 14,
    color: t.colors.textPrimary,
    textAlignVertical: "top" as const,
  },
  roleRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  rolePill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
  },
  rolePillActive: {
    borderColor: t.colors.primary,
    backgroundColor: t.colors.primarySubtle,
  },
  roleText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
    textTransform: "capitalize" as const,
  },
  roleTextActive: {
    color: t.colors.primary,
  },
})
