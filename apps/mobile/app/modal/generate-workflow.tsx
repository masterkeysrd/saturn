import { useState } from "react"
import { StyleSheet, Text, TextInput, View } from "react-native"
import { useRouter } from "expo-router"
import { useGenerateFlowMutation } from "@saturn/api/saturn/platform/workflow/v1/workflow"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { setPendingWorkflowDraft } from "@/components/workflows/workflow-draft-store"
import { Sparkles } from "lucide-react-native"

export default function GenerateWorkflowModalScreen() {
  const router = useRouter()
  const toast = useToast()
  const [prompt, setPrompt] = useState("")
  const generateMutation = useGenerateFlowMutation()

  const handleGenerate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    try {
      haptics.light()
      const flow = await generateMutation.mutateAsync({ prompt: trimmed })
      setPendingWorkflowDraft(flow)
      haptics.success()
      router.replace("/(app)/workflows/new" as never)
    } catch (err) {
      haptics.error()
      toast.show({
        title:
          err instanceof Error ? err.message : "Failed to generate workflow",
        type: "error",
      })
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Sparkles size={20} color={theme.colors.primary} />
        <Text style={styles.title}>Build Workflow with AI</Text>
      </View>
      <Text style={styles.subtitle}>
        Describe what should trigger your automation and what steps or actions
        to perform. The generated draft opens in the editor before saving.
      </Text>

      <TextInput
        style={styles.input}
        multiline
        value={prompt}
        onChangeText={setPrompt}
        placeholder="e.g. Every weekday at 9am, check pending bills and summarize them..."
        placeholderTextColor={theme.colors.textMuted}
      />

      <Button
        onPress={handleGenerate}
        loading={generateMutation.isPending}
        disabled={!prompt.trim()}
        leftIcon={<Sparkles size={16} color={theme.colors.primaryForeground} />}
      >
        Generate Draft
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
  },
  input: {
    minHeight: 130,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 14,
    fontSize: 14,
    color: theme.colors.textPrimary,
    textAlignVertical: "top",
  },
})
