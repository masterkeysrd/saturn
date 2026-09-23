import React, { forwardRef, useState, useMemo } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native"
import BottomSheet from "@gorhom/bottom-sheet"
import { Check, Search } from "lucide-react-native"
import { type CurrencyInfo } from "@saturn/api/saturn/finance/v1/finance"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet } from "@/components/ui/bottom-sheet"
import { getCurrencySymbol } from "../finance-utils"
import { sheetStyles } from "./sheet-styles"

export interface CurrencyPickerSheetProps {
  currencies: CurrencyInfo[]
  selectedCurrency: string
  onSelect: (code: string) => void
  isLoading?: boolean
  snapPoints?: (string | number)[]
}

export const CurrencyPickerSheet = forwardRef<
  BottomSheet,
  CurrencyPickerSheetProps
>(
  (
    {
      currencies,
      selectedCurrency,
      onSelect,
      isLoading = false,
      snapPoints = ["65%"],
    },
    ref
  ) => {
    const [search, setSearch] = useState("")

    const availableCurrencies = useMemo(() => {
      if (!search.trim()) return currencies
      const q = search.toLowerCase().trim()
      return currencies.filter(
        (c) =>
          c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      )
    }, [currencies, search])

    return (
      <AppBottomSheet ref={ref} title="Select Currency" snapPoints={snapPoints}>
        <View style={sheetStyles.currencySearchContainer}>
          <Search size={16} color={theme.colors.textMuted} />
          <TextInput
            style={sheetStyles.currencySearchInput}
            placeholder="Search currency code or name..."
            placeholderTextColor={theme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <ScrollView
          contentContainerStyle={sheetStyles.sheetListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.primary}
              style={{ marginVertical: 20 }}
            />
          ) : availableCurrencies.length === 0 ? (
            <View style={sheetStyles.emptySheetBox}>
              <Text style={sheetStyles.emptySheetText}>
                No currencies found.
              </Text>
            </View>
          ) : (
            availableCurrencies.map((c) => {
              const isSelected =
                selectedCurrency.toUpperCase() === c.code.toUpperCase()
              return (
                <TouchableOpacity
                  key={c.code}
                  style={[
                    sheetStyles.accountListItem,
                    isSelected && sheetStyles.accountListItemActive,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    haptics.light()
                    onSelect(c.code)
                    if (ref && "current" in ref && ref.current) {
                      ref.current.close()
                    }
                  }}
                >
                  <View style={sheetStyles.currencyBadgeCode}>
                    <Text style={sheetStyles.currencyBadgeCodeText}>
                      {c.code}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sheetStyles.accountItemTitle}>{c.name}</Text>
                    <Text style={sheetStyles.accountItemSubtitle}>
                      Symbol: {getCurrencySymbol(c.code)}
                    </Text>
                  </View>
                  {isSelected && (
                    <Check size={18} color={theme.colors.primary} />
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

CurrencyPickerSheet.displayName = "CurrencyPickerSheet"
