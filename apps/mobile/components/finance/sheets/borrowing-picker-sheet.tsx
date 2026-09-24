import React, { forwardRef } from "react"
import { Text, View, ActivityIndicator } from "react-native"
import BottomSheet, {
  BottomSheetFlatList,
  TouchableOpacity,
} from "@gorhom/bottom-sheet"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { HandCoins } from "lucide-react-native"
import { type Borrowing } from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount } from "@saturn/core"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet, BottomSheetHeader } from "@/components/ui/bottom-sheet"
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
    const insets = useSafeAreaInsets()

    const handleClose = () => {
      if (ref && "current" in ref && ref.current) {
        ref.current.close()
      }
    }

    return (
      <AppBottomSheet ref={ref} snapPoints={snapPoints}>
        <BottomSheetFlatList
          data={borrowings}
          keyExtractor={(b) => b.id || ""}
          contentContainerStyle={[
            sheetStyles.sheetListContent,
            {
              paddingHorizontal: 16,
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <BottomSheetHeader
              title="Select Loan Agreement"
              onClose={handleClose}
            />
          }
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator
                size="small"
                color="#f59e0b"
                style={{ marginVertical: 20 }}
              />
            ) : (
              <View style={sheetStyles.emptySheetBox}>
                <Text style={sheetStyles.emptySheetText}>
                  No active loan agreements found.
                </Text>
              </View>
            )
          }
          renderItem={({ item: b }) => {
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
                  handleClose()
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
          }}
        />
      </AppBottomSheet>
    )
  }
)

BorrowingPickerSheet.displayName = "BorrowingPickerSheet"
