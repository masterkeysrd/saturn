import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native"
import { insertVariableToken, type WorkflowVariable } from "@saturn/core"
import { theme } from "@/lib/theme"
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

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: theme.colors.textMuted,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryDark,
  },
  chipText: {
    fontSize: 11,
    fontFamily: theme.typography.mono,
    color: theme.colors.primary,
    fontWeight: "600",
  },
})
