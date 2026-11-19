import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { insertVariableToken, type WorkflowVariable } from "@saturn/core"
import { useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

interface VariableChipPickerProps {
  variables: WorkflowVariable[]
  currentValue: string
  onInsert: (nextValue: string) => void
  rawMode?: boolean
}

export function VariableChipPicker({
  variables,
  currentValue,
  onInsert,
  rawMode = false,
}: VariableChipPickerProps) {
  const styles = useThemedStyles(createStyles)

  if (variables.length === 0) return null

  return (
    <View style={styles.container}>
      <Text style={styles.label}>INSERT VARIABLE</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {variables.map((v) => (
          <TouchableOpacity
            key={v.path}
            activeOpacity={0.7}
            style={styles.chip}
            onPress={() => {
              haptics.selection()
              const res = insertVariableToken(
                currentValue,
                v.path,
                undefined,
                rawMode
              )
              onInsert(res.value)
            }}
          >
            <Text style={styles.chipText}>
              {rawMode ? v.path : `{{ ${v.path} }}`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.6,
    color: t.colors.textMuted,
  },
  chipsRow: {
    flexDirection: "row" as const,
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: t.colors.primaryDark,
  },
  chipText: {
    fontSize: 11,
    fontFamily: t.typography.mono,
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
})
