import { Text, View, TouchableOpacity } from "react-native"
import { Link, Stack } from "expo-router"
import { useI18n } from "@saturn/hooks"
import { useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

export default function NotFoundScreen() {
  const { t } = useI18n()
  const styles = useThemedStyles(createStyles)

  return (
    <>
      <Stack.Screen options={{ title: t("common.notFound.title") }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t("common.notFound.description")}</Text>
        <Link href="/" asChild>
          <TouchableOpacity style={styles.link}>
            <Text style={styles.linkText}>
              {t("common.notFound.returnCta")}
            </Text>
          </TouchableOpacity>
        </Link>
      </View>
    </>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 20,
    backgroundColor: t.colors.background,
  },
  title: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    marginBottom: 16,
  },
  link: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: t.colors.surfaceHighlight,
    borderRadius: t.radius.md,
  },
  linkText: {
    fontSize: 14,
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
})
