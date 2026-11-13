import React, { useState, useMemo } from "react"
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native"
import { X, User } from "lucide-react-native"
import { useContactSuggestions } from "@saturn/hooks"
import type { MailRecipientFormValues } from "@saturn/schemas"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"

export interface RecipientInputProps {
  label: string
  recipients: MailRecipientFormValues[]
  onChangeRecipients: (recipients: MailRecipientFormValues[]) => void
  placeholder?: string
  testID?: string
}

export function RecipientInput({
  label,
  recipients,
  onChangeRecipients,
  placeholder = "Add recipient...",
  testID,
}: RecipientInputProps) {
  const [inputText, setInputText] = useState("")
  const [isFocused, setIsFocused] = useState(false)

  const { data: suggestionsData } = useContactSuggestions(inputText, {
    enabled: isFocused && inputText.trim().length > 0,
  })

  const suggestions = useMemo(() => {
    const list = suggestionsData?.contacts || []
    const existingEmails = new Set(recipients.map((r) => r.email.toLowerCase()))
    return list.filter(
      (c) => c.email && !existingEmails.has(c.email.toLowerCase())
    )
  }, [suggestionsData, recipients])

  const handleAddEmail = (emailStr: string, displayName = "") => {
    const cleanEmail = emailStr.trim()
    if (!cleanEmail) return
    if (!cleanEmail.includes("@")) return

    const exists = recipients.some(
      (r) => r.email.toLowerCase() === cleanEmail.toLowerCase()
    )
    if (!exists) {
      haptics.selection()
      onChangeRecipients([...recipients, { email: cleanEmail, displayName }])
    }
    setInputText("")
  }

  const handleRemoveRecipient = (index: number) => {
    haptics.selection()
    const next = [...recipients]
    next.splice(index, 1)
    onChangeRecipients(next)
  }

  const handleSubmitEditing = () => {
    if (inputText.trim()) {
      handleAddEmail(inputText)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Text style={styles.label}>{label}:</Text>

        <View style={styles.chipInputWrapper}>
          {recipients.map((r, index) => (
            <View key={`${r.email}-${index}`} style={styles.chip}>
              <Text numberOfLines={1} style={styles.chipText}>
                {r.displayName || r.email}
              </Text>
              <Pressable
                testID={`remove-recipient-${r.email}`}
                hitSlop={8}
                onPress={() => handleRemoveRecipient(index)}
                style={styles.chipRemoveBtn}
              >
                <X size={12} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          ))}

          <TextInput
            testID={testID}
            value={inputText}
            onChangeText={(text) => {
              if (text.endsWith(",") || text.endsWith(" ")) {
                handleAddEmail(text.slice(0, -1))
              } else {
                setInputText(text)
              }
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false)
              if (inputText.trim()) {
                handleAddEmail(inputText)
              }
            }}
            onSubmitEditing={handleSubmitEditing}
            placeholder={recipients.length === 0 ? placeholder : ""}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            style={styles.textInput}
          />
        </View>
      </View>

      {/* Contact suggestions dropdown */}
      {isFocused && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.suggestionsList}
          >
            {suggestions.slice(0, 5).map((contact) => (
              <Pressable
                key={contact.email || ""}
                testID={`contact-suggestion-${contact.email || ""}`}
                onPress={() => {
                  if (contact.email) {
                    handleAddEmail(contact.email, contact.displayName || "")
                  }
                }}
                style={({ pressed }) => [
                  styles.suggestionItem,
                  pressed && styles.suggestionItemPressed,
                ]}
              >
                <View style={styles.avatarMini}>
                  <User size={13} color={theme.colors.textMuted} />
                </View>
                <View style={styles.suggestionDetails}>
                  <Text numberOfLines={1} style={styles.suggestionName}>
                    {contact.displayName || contact.email || ""}
                  </Text>
                  {contact.displayName && (
                    <Text numberOfLines={1} style={styles.suggestionEmail}>
                      {contact.email}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: 4,
    position: "relative",
    zIndex: 10,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    minHeight: 44,
  },
  label: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: "500",
    width: 44,
  },
  chipInputWrapper: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 3,
    maxWidth: 220,
  },
  chipText: {
    fontSize: 12,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  chipRemoveBtn: {
    padding: 2,
    borderRadius: theme.radius.full,
  },
  textInput: {
    flex: 1,
    minWidth: 120,
    fontSize: 14,
    color: theme.colors.textPrimary,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  suggestionsContainer: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.md,
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 6,
    overflow: "hidden",
    maxHeight: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  suggestionsList: {
    flexGrow: 0,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  suggestionItemPressed: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  avatarMini: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  suggestionDetails: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  suggestionEmail: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
})
