import React, { forwardRef } from "react"
import { Text, View, ActivityIndicator } from "react-native"
import BottomSheet, {
  BottomSheetFlatList,
  TouchableOpacity,
} from "@gorhom/bottom-sheet"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { CalendarClock } from "lucide-react-native"
import {
  type ScheduledTransaction,
  type RecurringTransaction,
} from "@saturn/api/saturn/finance/v1/finance"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet, BottomSheetHeader } from "@/components/ui/bottom-sheet"
import { getScheduledDisplayName } from "../finance-utils"
import { sheetStyles } from "./sheet-styles"

export interface ScheduledPickerSheetProps {
  scheduledTransactions: ScheduledTransaction[]
  recurringTemplates?: RecurringTransaction[]
  selectedScheduledId?: string
  onSelect: (item: ScheduledTransaction) => void
  isLoading?: boolean
  snapPoints?: (string | number)[]
}

export const ScheduledPickerSheet = forwardRef<
  BottomSheet,
  ScheduledPickerSheetProps
>(
  (
    {
      scheduledTransactions,
      recurringTemplates = [],
      selectedScheduledId,
      onSelect,
      isLoading = false,
      snapPoints = ["60%"],
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
          data={scheduledTransactions}
          keyExtractor={(st) => st.id || ""}
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
              title="Pending Scheduled Items"
              onClose={handleClose}
            />
          }
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator
                size="small"
                color="#6366f1"
                style={{ marginVertical: 20 }}
              />
            ) : (
              <View style={sheetStyles.emptySheetBox}>
                <Text style={sheetStyles.emptySheetText}>
                  No pending scheduled items found.
                </Text>
              </View>
            )
          }
          renderItem={({ item: st }) => {
            const isSelected = selectedScheduledId === st.id
            const amountVal = (parseInt(st.amount || "0", 10) / 100).toFixed(2)
            const displayName = getScheduledDisplayName(st, recurringTemplates)

            return (
              <TouchableOpacity
                key={st.id}
                style={[
                  sheetStyles.accountListItem,
                  isSelected && sheetStyles.accountListItemActive,
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  haptics.light()
                  onSelect(st)
                  handleClose()
                }}
              >
                <View style={sheetStyles.accountIconBadge}>
                  <CalendarClock size={18} color="#6366f1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sheetStyles.accountItemTitle} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={sheetStyles.accountItemSubtitle}>
                    Due:{" "}
                    {st.dueDate
                      ? new Date(st.dueDate).toLocaleDateString()
                      : "Pending"}
                  </Text>
                </View>
                <Text style={sheetStyles.scheduledItemAmount}>
                  ${amountVal}
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      </AppBottomSheet>
    )
  }
)

ScheduledPickerSheet.displayName = "ScheduledPickerSheet"
