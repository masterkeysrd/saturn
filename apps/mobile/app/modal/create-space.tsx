import {
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
import { useI18n } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

export default function CreateSpaceModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const { switchSpace, refetchSpaces } = useSpace()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const { t } = useI18n()

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
        title: t("settings.spaces.mobile.createdToast"),
        message: t("settings.spaces.mobile.createdSwitched", {
          name: values.name.trim(),
        }),
      })

      router.back()
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : t("settings.spaces.mobile.createFailedDefault")
      setError("name", { message: msg })
      toast.show({
        type: "error",
        title: t("settings.spaces.mobile.createFailedToast"),
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
        <Text style={styles.subtitle}>{t("settings.spaces.mobile.createDesc")}</Text>

        <Card style={styles.formCard}>
          <TextInput
            control={control}
            name="name"
            label={t("settings.spaces.mobile.workspaceName")}
            placeholder={t("settings.spaces.mobile.workspaceNamePlaceholder")}
            leftIcon={<Layers size={18} color={colors.primary} />}
            autoFocus
          />

          <TextInput
            control={control}
            name="description"
            label={t("settings.spaces.mobile.descriptionOptional")}
            placeholder={t("settings.spaces.mobile.descriptionPlaceholder")}
            leftIcon={<FileText size={18} color={colors.textMuted} />}
            multiline
            numberOfLines={2}
          />
        </Card>

        <View style={styles.actionsRow}>
          <Button
            variant="secondary"
            size="lg"
            style={styles.cancelBtn}
            leftIcon={<X size={18} color={colors.textMuted} />}
            onPress={() => router.back()}
          >
            {t("common.cancel")}
          </Button>

          <Button
            variant="primary"
            size="lg"
            style={styles.createBtn}
            loading={createSpaceMutation.isPending || isSubmitting}
            leftIcon={<Check size={18} color={colors.primaryForeground} />}
            onPress={handleSubmit(onValid)}
          >
            {t("common.create")}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    padding: 20,
    gap: 16,
  },
  subtitle: {
    fontSize: 14,
    color: t.colors.textMuted,
    lineHeight: 20,
  },
  formCard: {
    padding: 20,
    gap: 16,
  },
  actionsRow: {
    flexDirection: "row" as const,
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
