import React, { forwardRef } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native"
import BottomSheet from "@gorhom/bottom-sheet"
import { CalendarClock } from "lucide-react-native"
import { type ScheduledTransaction } from "@saturn/api/saturn/finance/v1/finance"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { sheetStyles } from "./sheet-styles"

export interface ScheduledPickerSheetProps {
  scheduledTransactions: ScheduledTransaction[]
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
      selectedScheduledId,
      onSelect,
      isLoading = false,
      snapPoints = ["60%"],
    },
    ref
  ) => {
    return (
      <AppBottomSheet
        ref={ref}
        title="Pending Scheduled Items"
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
          ) : scheduledTransactions.length === 0 ? (
            <View style={sheetStyles.emptySheetBox}>
              <Text style={sheetStyles.emptySheetText}>
                No pending scheduled items found.
              </Text>
            </View>
          ) : (
            scheduledTransactions.map((st) => {
              const isSelected = selectedScheduledId === st.id
              const amountVal = (parseInt(st.amount || "0", 10) / 100).toFixed(
                2
              )

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
                    if (ref && "current" in ref && ref.current) {
                      ref.current.close()
                    }
                  }}
                >
                  <View style={sheetStyles.accountIconBadge}>
                    <CalendarClock size={18} color="#6366f1" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sheetStyles.accountItemTitle}>
                      {st.metadata?.description ||
                        st.recurringTransaction?.name ||
                        "Scheduled Item"}
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
            })
          )}
        </ScrollView>
      </AppBottomSheet>
    )
  }
)

ScheduledPickerSheet.displayName = "ScheduledPickerSheet"
