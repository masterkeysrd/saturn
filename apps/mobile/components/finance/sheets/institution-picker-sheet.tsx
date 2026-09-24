import { forwardRef, useState, useMemo } from "react"
import { Text, View, ActivityIndicator, Image } from "react-native"
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetTextInput,
  TouchableOpacity,
} from "@gorhom/bottom-sheet"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Check, Landmark, Search } from "lucide-react-native"
import type { Account_InstitutionInfo } from "@saturn/api/saturn/finance/v1/finance"
import { getInstitutionLogoUrl } from "@saturn/core"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { AppBottomSheet, BottomSheetHeader } from "@/components/ui/bottom-sheet"
import { sheetStyles } from "./sheet-styles"

export interface InstitutionPickerSheetProps {
  title?: string
  institutions: Account_InstitutionInfo[]
  selectedInstitutionId?: string
  onSelect: (institutionId: string) => void
  allowNone?: boolean
  isLoading?: boolean
  snapPoints?: (string | number)[]
}

export const InstitutionPickerSheet = forwardRef<
  BottomSheet,
  InstitutionPickerSheetProps
>(
  (
    {
      title = "Select Financial Institution",
      institutions,
      selectedInstitutionId = "",
      onSelect,
      allowNone = true,
      isLoading = false,
      snapPoints = ["65%", "90%"],
    },
    ref
  ) => {
    const insets = useSafeAreaInsets()
    const [search, setSearch] = useState("")

    const filteredInstitutions = useMemo(() => {
      const q = search.trim().toLowerCase()
      if (!q) return institutions
      return institutions.filter((inst) => inst.name.toLowerCase().includes(q))
    }, [institutions, search])

    const handleSelect = (instId: string) => {
      haptics.selection()
      onSelect(instId)
      if (ref && "current" in ref && ref.current) {
        ref.current.close()
      }
    }

    return (
      <AppBottomSheet
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        keyboardBehavior="extend"
      >
        <BottomSheetFlatList
          data={filteredInstitutions}
          keyExtractor={(item: Account_InstitutionInfo) => item.id || ""}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            sheetStyles.sheetListContent,
            { paddingHorizontal: 16, paddingBottom: insets.bottom + 20 },
          ]}
          ListHeaderComponent={
            <View>
              <BottomSheetHeader
                title={title}
                onClose={() => {
                  if (ref && "current" in ref && ref.current) {
                    ref.current.close()
                  }
                }}
              />

              {/* Search Bar */}
              <View style={sheetStyles.accountSearchContainer}>
                <Search size={16} color={theme.colors.textMuted} />
                <BottomSheetTextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search institutions..."
                  placeholderTextColor={theme.colors.textMuted}
                  style={sheetStyles.accountSearchInput}
                  clearButtonMode="while-editing"
                />
              </View>

              {/* Optional "None / Custom" Option */}
              {allowNone && !search.trim() && (
                <TouchableOpacity
                  onPress={() => handleSelect("")}
                  style={[
                    sheetStyles.accountListItem,
                    !selectedInstitutionId && sheetStyles.accountListItemActive,
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={sheetStyles.accountIconBadge}>
                    <Landmark size={18} color={theme.colors.textMuted} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={sheetStyles.accountItemTitle}>
                      No Institution / Custom
                    </Text>
                    <Text style={sheetStyles.accountItemSubtitle}>
                      Standalone card or cash wallet
                    </Text>
                  </View>

                  {!selectedInstitutionId && (
                    <Check size={18} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          }
          ListEmptyComponent={
            isLoading ? (
              <View style={sheetStyles.emptySheetBox}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
              </View>
            ) : (
              <View style={sheetStyles.emptySheetBox}>
                <Text style={sheetStyles.emptySheetText}>
                  No institutions found
                </Text>
              </View>
            )
          }
          renderItem={({ item }: { item: Account_InstitutionInfo }) => {
            const isSelected = selectedInstitutionId === item.id
            const logoUrl =
              item.logoUrl || getInstitutionLogoUrl(item.domain, item.name)

            return (
              <TouchableOpacity
                onPress={() => handleSelect(item.id || "")}
                style={[
                  sheetStyles.accountListItem,
                  isSelected && sheetStyles.accountListItemActive,
                ]}
                activeOpacity={0.7}
              >
                <View style={sheetStyles.accountIconBadge}>
                  {logoUrl ? (
                    <Image
                      source={{ uri: logoUrl }}
                      style={sheetStyles.accountLogoImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <Landmark size={18} color={theme.colors.textPrimary} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={sheetStyles.accountItemTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.domain ? (
                    <Text
                      style={sheetStyles.accountItemSubtitle}
                      numberOfLines={1}
                    >
                      {item.domain}
                    </Text>
                  ) : null}
                </View>

                {isSelected && <Check size={18} color={theme.colors.primary} />}
              </TouchableOpacity>
            )
          }}
        />
      </AppBottomSheet>
    )
  }
)
