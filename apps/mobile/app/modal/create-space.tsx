import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Layers, FileText, Check, X } from "lucide-react-native"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CreateSpaceSchema, type CreateSpaceFormValues } from "@saturn/schemas"
import { useCreateSpaceMutation } from "@saturn/api/saturn/space/v1/space"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

export default function CreateSpaceModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { switchSpace, refetchSpaces } = useSpace()

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<CreateSpaceFormValues>({
    resolver: zodResolver(CreateSpaceSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  })

  const createSpaceMutation = useCreateSpaceMutation()

  const onValid = async (values: CreateSpaceFormValues) => {
    try {
      const newSpace = await createSpaceMutation.mutateAsync({
        name: values.name.trim(),
        description: values.description?.trim() || "",
      })

      refetchSpaces()

      if (newSpace?.id) {
        await switchSpace(newSpace.id)
      }

      toast.show({
        type: "success",
        title: "Workspace Created",
        message: `Active space switched to "${values.name.trim()}"`,
      })

      router.back()
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create workspace"
      setError("name", { message: msg })
      toast.show({
        type: "error",
        title: "Creation Failed",
        message: msg,
      })
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: Math.max(insets.bottom, 20) + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          Workspaces keep your accounts, budgets, transactions, and automations
          completely isolated.
        </Text>

        <Card style={styles.formCard}>
          <TextInput
            control={control}
            name="name"
            label="Workspace Name"
            placeholder="e.g. Personal, Consulting, Family"
            leftIcon={<Layers size={18} color={theme.colors.primary} />}
            autoFocus
          />

          <TextInput
            control={control}
            name="description"
            label="Description (Optional)"
            placeholder="e.g. Primary personal finance & budgeting"
            leftIcon={<FileText size={18} color={theme.colors.textMuted} />}
            multiline
            numberOfLines={2}
          />
        </Card>

        <View style={styles.actionsRow}>
          <Button
            variant="secondary"
            size="lg"
            style={styles.cancelBtn}
            leftIcon={<X size={18} color={theme.colors.textMuted} />}
            onPress={() => router.back()}
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="lg"
            style={styles.createBtn}
            loading={createSpaceMutation.isPending || isSubmitting}
            leftIcon={
              <Check size={18} color={theme.colors.primaryForeground} />
            }
            onPress={handleSubmit(onValid)}
          >
            Create
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: 20,
    gap: 16,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  formCard: {
    padding: 20,
    gap: 16,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
  },
  createBtn: {
    flex: 2,
  },
})
