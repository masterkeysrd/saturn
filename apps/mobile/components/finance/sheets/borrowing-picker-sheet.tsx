import React, { forwardRef } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native"
import BottomSheet from "@gorhom/bottom-sheet"
import { HandCoins } from "lucide-react-native"
import { type Borrowing } from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount } from "@saturn/core"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { sheetStyles } from "./sheet-styles"

export interface BorrowingPickerSheetProps {
  borrowings: Borrowing[]
  selectedBorrowingId?: string
  onSelect: (item: Borrowing) => void
  isLoading?: boolean
  snapPoints?: (string | number)[]
}

export const BorrowingPickerSheet = forwardRef<
  BottomSheet,
  BorrowingPickerSheetProps
>(
  (
    {
      borrowings,
      selectedBorrowingId,
      onSelect,
      isLoading = false,
      snapPoints = ["50%"],
    },
    ref
  ) => {
    return (
      <AppBottomSheet
        ref={ref}
        title="Select Loan Agreement"
        snapPoints={snapPoints}
      >
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
          ) : borrowings.length === 0 ? (
            <View style={sheetStyles.emptySheetBox}>
              <Text style={sheetStyles.emptySheetText}>
                No active loan agreements found.
              </Text>
            </View>
          ) : (
            borrowings.map((b) => {
              const isSelected = selectedBorrowingId === b.id

              return (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    sheetStyles.accountListItem,
                    isSelected && sheetStyles.accountListItemActive,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    haptics.light()
                    onSelect(b)
                    if (ref && "current" in ref && ref.current) {
                      ref.current.close()
                    }
                  }}
                >
                  <View style={sheetStyles.accountIconBadge}>
                    <HandCoins size={18} color="#f59e0b" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sheetStyles.accountItemTitle}>
                      {b.counterparty || "Agreement"}
                    </Text>
                    <Text style={sheetStyles.accountItemSubtitle}>
                      {b.direction === "LENT"
                        ? "Lending (They owe you)"
                        : "Borrowing (You owe)"}
                    </Text>
                  </View>
                  <Text style={sheetStyles.scheduledItemAmount}>
                    {formatAmount(b.totalAmount, b.currency)}
                  </Text>
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
      </AppBottomSheet>
    )
  }
)

BorrowingPickerSheet.displayName = "BorrowingPickerSheet"
