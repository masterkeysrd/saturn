import { StyleSheet, Text, View, TouchableOpacity } from "react-native"
import { Link, Stack } from "expo-router"
import { theme } from "@/lib/theme"

export default function NotFoundScreen() {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 16,
  },
  link: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radius.md,
  },
  linkText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "600",
  },
})
