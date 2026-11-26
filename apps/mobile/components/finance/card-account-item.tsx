import React, { useState } from "react"
import { StyleSheet, View, Text, TouchableOpacity, Image } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Landmark, CreditCard, Coins, Wallet } from "lucide-react-native"
import { formatAmount, getInstitutionLogoUrl } from "@saturn/core"
import { useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import type {
  Account,
  Account_InstitutionInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { useThemedStyles, type SaturnMobileTheme } from "../../lib/theme"
import { MonoAmount } from "../ui/typography"
import { haptics } from "../../lib/haptics"

export interface CardAccountTheme {
  accentDark: string
  accentLight: string
  border: string
  textColor: string
}

export function getCardTheme(colorName?: string): CardAccountTheme {
  switch (colorName?.toLowerCase()) {
    case "teal":
      return {
        accentDark: "#042f2e",
        accentLight: "#0d9488",
        border: "rgba(13, 148, 136, 0.35)",
        textColor: "#2dd4bf",
      }
    case "sky":
      return {
        accentDark: "#082f49",
        accentLight: "#0ea5e9",
        border: "rgba(14, 165, 233, 0.35)",
        textColor: "#38bdf8",
      }
    case "blue":
      return {
        accentDark: "#172554",
        accentLight: "#3b82f6",
        border: "rgba(59, 130, 246, 0.35)",
        textColor: "#60a5fa",
      }
    case "violet":
      return {
        accentDark: "#2e1065",
        accentLight: "#8b5cf6",
        border: "rgba(139, 92, 246, 0.35)",
        textColor: "#a78bfa",
      }
    case "plum":
      return {
        accentDark: "#3b0764",
        accentLight: "#a855f7",
        border: "rgba(168, 85, 247, 0.35)",
        textColor: "#c084fc",
      }
    case "pink":
      return {
        accentDark: "#500724",
        accentLight: "#ec4899",
        border: "rgba(236, 72, 153, 0.35)",
        textColor: "#f472b6",
      }
    case "coral":
    case "rose":
      return {
        accentDark: "#4c0519",
        accentLight: "#f43f5e",
        border: "rgba(244, 63, 94, 0.35)",
        textColor: "#fb7185",
      }
    case "orange":
      return {
        accentDark: "#431407",
        accentLight: "#f97316",
        border: "rgba(249, 115, 22, 0.35)",
        textColor: "#fb923c",
      }
    case "amber":
      return {
        accentDark: "#451a03",
        accentLight: "#f59e0b",
        border: "rgba(245, 158, 11, 0.35)",
        textColor: "#fbbf24",
      }
    case "lime":
      return {
        accentDark: "#1a2e05",
        accentLight: "#84cc16",
        border: "rgba(132, 204, 22, 0.35)",
        textColor: "#a3e635",
      }
    case "emerald":
      return {
        accentDark: "#064e3b",
        accentLight: "#10b981",
        border: "rgba(16, 185, 129, 0.35)",
        textColor: "#34d399",
      }
    case "indigo":
    default:
      return {
        accentDark: "#1e1b4b",
        accentLight: "#6366f1",
        border: "rgba(99, 102, 241, 0.35)",
        textColor: "#818cf8",
      }
  }
}

function TypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  switch (type) {
    case "BANK":
      return <Landmark size={size} color="#ffffff" />
    case "CREDIT_CARD":
      return <CreditCard size={size} color="#ffffff" />
    case "CASH":
      return <Coins size={size} color="#ffffff" />
    default:
      return <Wallet size={size} color="#ffffff" />
  }
}

interface CardAccountItemProps {
  acc: Account
  institution?: Account_InstitutionInfo
  baseCurrency?: string
  convertedText?: string
  width?: number | string
  style?: object
  hideHolderName?: boolean
  onPress?: () => void
}

export function CardAccountItem({
  acc,
  institution,
  baseCurrency,
  convertedText,
  width,
  style,
  hideHolderName = false,
  onPress,
}: CardAccountItemProps) {
  const styles = useThemedStyles(createStyles)
  const { t, locale } = useI18n()
  const [logoError, setLogoError] = useState(false)
  const cardTheme = getCardTheme(acc.color)
  const isCredit = acc.type === "CREDIT_CARD"

  const inst = institution || acc.institution
  const logoUrl =
    inst?.logoUrl || getInstitutionLogoUrl(inst?.domain, inst?.name || acc.name)

  const rawBal = Number(acc.currentBalance || "0")
  const formattedBal = formatAmount(acc.currentBalance)
  const limit = Number(acc.creditLimit || "0")

  // Masked number formatting (e.g. ••••  ••••  ••••  4210)
  const maskedNumber = acc.lastFour
    ? `••••  ••••  ••••  ${acc.lastFour}`
    : `••••  ••••  ••••  ••••`

  // Credit Card Utilization Calculations
  const debtOwed = rawBal > 0 ? rawBal : 0
  const overpayment = rawBal < 0 ? Math.abs(rawBal) : 0
  const availableCents = Math.max(0, limit - debtOwed + overpayment)
  const utilizationPercent =
    limit > 0 ? Math.min(100, Math.max(0, (debtOwed / limit) * 100)) : 0

  // Amount Color: Credit card negative is overpayment (green), positive is debt (rose), otherwise white
  const balanceColor =
    isCredit && rawBal > 0
      ? "#fb7185" // rose-400
      : isCredit && rawBal < 0
        ? "#34d399" // emerald-400 (GREEN for negative credit card balance)
        : "#ffffff"

  const containerStyle = [
    styles.cardContainer,
    width !== undefined && { width: width as any },
    { borderColor: cardTheme.border },
    !acc.isActive && styles.inactiveCard,
    style,
  ]

  const content = (
    <>
      {/* Native Linear Gradient Background */}
      <LinearGradient
        colors={["#0b0f19", cardTheme.accentDark, "#0f172a"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Ambient Gloss & Light Sheen */}
      <LinearGradient
        colors={[
          "rgba(255, 255, 255, 0.08)",
          "transparent",
          "rgba(255, 255, 255, 0.02)",
        ]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Ambient Light Circle Watermark */}
      <View
        style={[styles.ambientGlow, { backgroundColor: cardTheme.accentLight }]}
        pointerEvents="none"
      />

      {/* Top Header: Institution Icon, Name & Default Badge */}
      <View style={styles.topHeader}>
        <View style={styles.institutionRow}>
          <View style={styles.iconSquircle}>
            {logoUrl && !logoError ? (
              <Image
                source={{ uri: logoUrl }}
                style={styles.institutionLogo}
                resizeMode="contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <TypeIcon type={acc.type} size={18} />
            )}
          </View>
          <View style={styles.headerTitles}>
            <Text style={styles.accountTitle} numberOfLines={1}>
              {inst?.name || acc.name}
            </Text>
            <Text style={styles.accountTypeLabel}>
              {getLocalizedEnumLabel(
                "finance",
                "accountType",
                acc.type,
                locale
              )}
            </Text>
          </View>
        </View>

        {acc.isDefault ? (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>
              {t("finance.accounts.card.defaultBadge")}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Embossed Masked Card Number */}
      <View style={styles.numberRow}>
        <Text style={styles.maskedNumberText}>{maskedNumber}</Text>
      </View>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        {/* Upper Row: Account Name & Balance Display */}
        <View style={styles.footerRow}>
          {!hideHolderName ? (
            <View style={styles.footerLeft}>
              <Text style={styles.footerSubText}>
                {t("finance.accounts.card.nameLabel")}
              </Text>
              <Text style={styles.holderName} numberOfLines={1}>
                {acc.name}
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.footerRight,
              hideHolderName && styles.footerBalanceLeading,
            ]}
          >
            <Text
              style={[
                styles.footerSubText,
                { textAlign: hideHolderName ? "left" : "right" },
              ]}
            >
              {isCredit
                ? rawBal > 0
                  ? t("finance.accounts.card.balanceOwed")
                  : t("finance.accounts.card.currentCredit")
                : t("finance.accounts.card.balance")}
            </Text>
            <View
              style={[
                styles.balanceRow,
                hideHolderName && styles.balanceRowLeading,
              ]}
            >
              <MonoAmount
                size="lg"
                color={balanceColor}
                style={styles.balanceText}
              >
                {formattedBal}
              </MonoAmount>
              <Text style={styles.currencyBadge}>{acc.currency}</Text>
            </View>
            {convertedText ? (
              <Text style={styles.convertedText}>{convertedText}</Text>
            ) : null}
          </View>
        </View>

        {/* Limit Info at End of Card (if credit card with limit) */}
        {isCredit && limit > 0 ? (
          <View style={styles.limitEndSection}>
            {/* Integrated Progress Bar Track */}
            <View style={styles.limitTrack}>
              <View
                style={[
                  styles.limitBar,
                  {
                    width: `${utilizationPercent}%`,
                    backgroundColor:
                      utilizationPercent > 80
                        ? "#f43f5e"
                        : utilizationPercent > 50
                          ? "#f59e0b"
                          : "#10b981",
                  },
                ]}
              />
            </View>

            {/* Subtext Row: Available & Limit */}
            <View style={styles.limitLabelsRow}>
              <Text style={styles.limitSubLabel}>
                {t("finance.accounts.card.available")}{" "}
                <Text style={styles.limitValueBold}>
                  {formatAmount(availableCents, acc.currency)}
                </Text>
              </Text>
              <Text style={styles.limitSubLabel}>
                {t("finance.accounts.card.limit")}{" "}
                <Text style={styles.limitValueBold}>
                  {formatAmount(limit, acc.currency)}
                </Text>
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </>
  )

  if (!onPress) {
    return <View style={containerStyle}>{content}</View>
  }

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => {
        haptics.light()
        onPress()
      }}
      style={containerStyle}
    >
      {content}
    </TouchableOpacity>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  cardContainer: {
    backgroundColor: "#0b0f19",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    minHeight: 190,
    justifyContent: "space-between" as const,
    overflow: "hidden" as const,
    ...t.shadows.md,
  },
  ambientGlow: {
    position: "absolute" as const,
    right: -30,
    bottom: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    opacity: 0.1,
  },
  inactiveCard: {
    opacity: 0.55,
  },
  topHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  institutionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  iconSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  },
  institutionLogo: {
    width: 22,
    height: 22,
    borderRadius: 4,
  },
  headerTitles: {
    flex: 1,
    gap: 2,
  },
  accountTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "rgba(255, 255, 255, 0.95)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },
  accountTypeLabel: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "rgba(255, 255, 255, 0.5)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: "800" as const,
    color: "#fcd34d",
    letterSpacing: 0.8,
  },
  numberRow: {
    marginVertical: 14,
  },
  maskedNumberText: {
    fontSize: 14,
    fontFamily: t.typography.mono,
    fontWeight: "700" as const,
    color: "rgba(255, 255, 255, 0.85)",
    letterSpacing: 2.8,
  },
  bottomSection: {
    gap: 8,
  },
  footerRow: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    justifyContent: "space-between" as const,
  },
  footerLeft: {
    flex: 1,
    marginRight: 12,
  },
  footerRight: {
    alignItems: "flex-end" as const,
  },
  footerBalanceLeading: {
    alignItems: "flex-start" as const,
  },
  footerSubText: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "rgba(255, 255, 255, 0.4)",
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    marginBottom: 2,
  },
  holderName: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: "rgba(255, 255, 255, 0.9)",
  },
  balanceRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
    justifyContent: "flex-end" as const,
    gap: 5,
  },
  balanceRowLeading: {
    justifyContent: "flex-start" as const,
  },
  balanceText: {
    fontSize: 20,
    fontWeight: "800" as const,
    letterSpacing: -0.3,
  },
  currencyBadge: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "rgba(255, 255, 255, 0.6)",
    textTransform: "uppercase" as const,
    marginBottom: 1,
  },
  convertedText: {
    fontSize: 10,
    fontWeight: "500" as const,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 2,
  },
  limitEndSection: {
    gap: 6,
    paddingTop: 4,
  },
  limitTrack: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 2,
    overflow: "hidden" as const,
  },
  limitBar: {
    height: "100%" as const,
    borderRadius: 2,
  },
  limitLabelsRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  limitSubLabel: {
    fontSize: 10,
    fontWeight: "500" as const,
    color: "rgba(255, 255, 255, 0.6)",
  },
  limitValueBold: {
    fontWeight: "700" as const,
    color: "#ffffff",
  },
})
