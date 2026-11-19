import { Text, View, TouchableOpacity } from "react-native"
import { Link, Stack } from "expo-router"
import { useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"

export default function NotFoundScreen() {
  const styles = useThemedStyles(createStyles)

  return (
    <>
      <Stack.Screen options={{ title: "Page Not Found" }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen does not exist.</Text>
        <Link href="/" asChild>
          <TouchableOpacity style={styles.link}>
            <Text style={styles.linkText}>Return to Dashboard</Text>
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
