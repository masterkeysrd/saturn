import React, { forwardRef } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native"
import BottomSheet from "@gorhom/bottom-sheet"
import { Check } from "lucide-react-native"
import { type Budget } from "@saturn/api/saturn/finance/v1/finance"
import { formatAmount } from "@saturn/core"
import { theme, getNativeBudgetColors } from "@/lib/theme"
import { getBudgetIcon } from "@/lib/budget-icons"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { formatInterval } from "../finance-utils"
import { sheetStyles } from "./sheet-styles"

export interface BudgetPickerSheetProps {
  budgets: Budget[]
  selectedBudgetId: string
  onSelect: (budget: Budget) => void
  isLoading?: boolean
  snapPoints?: (string | number)[]
}

export const BudgetPickerSheet = forwardRef<
  BottomSheet,
  BudgetPickerSheetProps
>(
  (
    {
      budgets,
      selectedBudgetId,
      onSelect,
      isLoading = false,
      snapPoints = ["65%"],
    },
    ref
  ) => {
    return (
      <AppBottomSheet ref={ref} title="Select Budget" snapPoints={snapPoints}>
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
          ) : budgets.length === 0 ? (
            <View style={sheetStyles.emptySheetBox}>
              <Text style={sheetStyles.emptySheetText}>
                No active budgets found.
              </Text>
            </View>
          ) : (
            budgets.map((b) => {
              const bColors = getNativeBudgetColors(b.color || "indigo")
              const BIcon = getBudgetIcon(b.icon, b.name)
              const isSelected = selectedBudgetId === b.id

              const spentCents = Number(b.currentPeriod?.spentAmount || "0")
              const limitCents = Number(b.limitAmount || "0")
              const percentage =
                limitCents > 0
                  ? Math.min(Math.round((spentCents / limitCents) * 100), 100)
                  : 0
              const remainingCents = Math.max(limitCents - spentCents, 0)
              const isOver = limitCents > 0 && spentCents > limitCents

              return (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    sheetStyles.budgetListItem,
                    isSelected && {
                      borderColor: bColors.bar,
                      backgroundColor: bColors.bg,
                    },
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
                  <View
                    style={[
                      sheetStyles.budgetIconBadge,
                      {
                        backgroundColor: bColors.bg,
                        borderColor: bColors.border,
                      },
                    ]}
                  >
                    <BIcon size={18} color={bColors.bar} />
                  </View>

                  <View style={sheetStyles.budgetDetailsCol}>
                    <View style={sheetStyles.budgetNameRow}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          flexShrink: 1,
                        }}
                      >
                        <Text
                          style={[
                            sheetStyles.budgetListItemTitle,
                            isSelected && {
                              color: bColors.text,
                              fontWeight: "700",
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {b.name}
                        </Text>
                        <View style={sheetStyles.budgetIntervalBadge}>
                          <Text style={sheetStyles.budgetIntervalText}>
                            {formatInterval(b.interval)}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          sheetStyles.budgetRemainingText,
                          isOver && sheetStyles.budgetOverText,
                        ]}
                      >
                        {isOver
                          ? "Over budget"
                          : `${formatAmount(String(remainingCents), b.currency)} left`}
                      </Text>
                    </View>

                    {/* Mini Progress Track */}
                    <View style={sheetStyles.miniProgressTrack}>
                      <View
                        style={[
                          sheetStyles.miniProgressBar,
                          {
                            width: `${percentage}%`,
                            backgroundColor: isOver
                              ? theme.colors.destructive
                              : bColors.bar,
                          },
                        ]}
                      />
                    </View>

                    <View style={sheetStyles.budgetMetaRow}>
                      <Text style={sheetStyles.budgetMetaText}>
                        {formatAmount(String(spentCents), b.currency)} spent of{" "}
                        {formatAmount(b.limitAmount, b.currency)}
                      </Text>
                      <Text
                        style={[
                          sheetStyles.budgetPercentText,
                          isOver && sheetStyles.budgetOverText,
                        ]}
                      >
                        {percentage}%
                      </Text>
                    </View>
                  </View>

                  {isSelected && (
                    <View style={sheetStyles.budgetCheckBadge}>
                      <Check size={18} color={bColors.bar} />
                    </View>
                  )}
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
      </AppBottomSheet>
    )
  }
)

BudgetPickerSheet.displayName = "BudgetPickerSheet"
