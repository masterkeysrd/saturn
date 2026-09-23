import React, { forwardRef } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native"
import BottomSheet from "@gorhom/bottom-sheet"
import { Check, Landmark } from "lucide-react-native"
import { type Account } from "@saturn/api/saturn/finance/v1/finance"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { sheetStyles } from "./sheet-styles"

export interface AccountPickerSheetProps {
  title?: string
  accounts: Account[]
  selectedAccountId: string
  onSelect: (accountId: string) => void
  allowNoAccount?: boolean
  isLoading?: boolean
  snapPoints?: (string | number)[]
}

export const AccountPickerSheet = forwardRef<
  BottomSheet,
  AccountPickerSheetProps
>(
  (
    {
      title = "Select Account",
      accounts,
      selectedAccountId,
      onSelect,
      allowNoAccount = true,
      isLoading = false,
      snapPoints = ["50%"],
    },
    ref
  ) => {
    return (
      <AppBottomSheet ref={ref} title={title} snapPoints={snapPoints}>
        <ScrollView
          contentContainerStyle={sheetStyles.sheetListContent}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.primary}
              style={{ marginVertical: 20 }}
            />
          ) : (
            <>
              {allowNoAccount && (
                <TouchableOpacity
                  style={[
                    sheetStyles.accountListItem,
                    !selectedAccountId && sheetStyles.accountListItemActive,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    haptics.light()
                    onSelect("")
                    if (ref && "current" in ref && ref.current) {
                      ref.current.close()
                    }
                  }}
                >
                  <View style={sheetStyles.accountIconBadge}>
                    <Landmark size={18} color={theme.colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sheetStyles.accountItemTitle}>
                      No Account (Cash)
                    </Text>
                    <Text style={sheetStyles.accountItemSubtitle}>
                      Does not deduct from bank balance
                    </Text>
                  </View>
                  {!selectedAccountId && (
                    <Check size={18} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              )}

              {accounts.map((acc) => {
                const isSelected = selectedAccountId === acc.id
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      sheetStyles.accountListItem,
                      isSelected && sheetStyles.accountListItemActive,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      haptics.light()
                      onSelect(acc.id || "")
                      if (ref && "current" in ref && ref.current) {
                        ref.current.close()
                      }
                    }}
                  >
                    <View style={sheetStyles.accountIconBadge}>
                      <Landmark
                        size={18}
                        color={
                          isSelected
                            ? theme.colors.primary
                            : theme.colors.textMuted
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={sheetStyles.accountItemTitle}>
                        {acc.name}
                      </Text>
                      <Text style={sheetStyles.accountItemSubtitle}>
                        {acc.currency} • {acc.type || "Account"}
                      </Text>
                    </View>
                    {isSelected && (
                      <Check size={18} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                )
              })}
            </>
          )}
        </ScrollView>
      </AppBottomSheet>
    )
  }
)

AccountPickerSheet.displayName = "AccountPickerSheet"
