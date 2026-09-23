import React, { useState } from "react"
import { StyleSheet, View, Text, TouchableOpacity, Image } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Landmark, CreditCard, Coins, Wallet } from "lucide-react-native"
import { formatAmount, getInstitutionLogoUrl } from "@saturn/core"
import type {
  Account,
  Account_InstitutionInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { theme } from "@/lib/theme"
import { MonoAmount } from "@/components/ui/typography"
import { haptics } from "@/lib/haptics"

interface CardAccountTheme {
  accentDark: string
  accentLight: string
  border: string
  textColor: string
}

function getCardTheme(colorName?: string): CardAccountTheme {
  switch (colorName) {
    case "emerald":
      return {
        accentDark: "#064e3b",
        accentLight: "#10b981",
        border: "rgba(16, 185, 129, 0.35)",
        textColor: "#34d399",
      }
    case "rose":
      return {
        accentDark: "#4c0519",
        accentLight: "#f43f5e",
        border: "rgba(244, 63, 94, 0.35)",
        textColor: "#fb7185",
      }
    case "amber":
      return {
        accentDark: "#451a03",
        accentLight: "#f59e0b",
        border: "rgba(245, 158, 11, 0.35)",
        textColor: "#fbbf24",
      }
    case "sky":
      return {
        accentDark: "#082f49",
        accentLight: "#0ea5e9",
        border: "rgba(14, 165, 233, 0.35)",
        textColor: "#38bdf8",
      }
    case "violet":
      return {
        accentDark: "#2e1065",
        accentLight: "#8b5cf6",
        border: "rgba(139, 92, 246, 0.35)",
        textColor: "#a78bfa",
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
  onPress?: () => void
}

export function CardAccountItem({
  acc,
  institution,
  baseCurrency,
  convertedText,
  width,
  style,
  onPress,
}: CardAccountItemProps) {
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

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => {
        haptics.light()
        onPress?.()
      }}
      style={[
        styles.cardContainer,
        width !== undefined && { width: width as any },
        { borderColor: cardTheme.border },
        !acc.isActive && styles.inactiveCard,
        style,
      ]}
    >
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
              {acc.type.replace(/_/g, " ")}
            </Text>
          </View>
        </View>

        {acc.isDefault ? (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>DEFAULT</Text>
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
          <View style={styles.footerLeft}>
            <Text style={styles.footerSubText}>NAME</Text>
            <Text style={styles.holderName} numberOfLines={1}>
              {acc.name}
            </Text>
          </View>

          <View style={styles.footerRight}>
            <Text style={[styles.footerSubText, { textAlign: "right" }]}>
              {isCredit
                ? rawBal > 0
                  ? "BALANCE OWED"
                  : "CURRENT CREDIT"
                : "BALANCE"}
            </Text>
            <View style={styles.balanceRow}>
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
                Available:{" "}
                <Text style={styles.limitValueBold}>
                  {formatAmount(availableCents, acc.currency)}
                </Text>
              </Text>
              <Text style={styles.limitSubLabel}>
                Limit:{" "}
                <Text style={styles.limitValueBold}>
                  {formatAmount(limit, acc.currency)}
                </Text>
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: "#0b0f19",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    minHeight: 190,
    justifyContent: "space-between",
    overflow: "hidden",
    ...theme.shadows.md,
  },
  ambientGlow: {
    position: "absolute",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  institutionRow: {
    flexDirection: "row",
    alignItems: "center",
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
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.95)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  accountTypeLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.5)",
    textTransform: "uppercase",
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
    fontWeight: "800",
    color: "#fcd34d",
    letterSpacing: 0.8,
  },
  numberRow: {
    marginVertical: 14,
  },
  maskedNumberText: {
    fontSize: 14,
    fontFamily: theme.typography.mono,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.85)",
    letterSpacing: 2.8,
  },
  bottomSection: {
    gap: 8,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  footerLeft: {
    flex: 1,
    marginRight: 12,
  },
  footerRight: {
    alignItems: "flex-end",
  },
  footerSubText: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.4)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  holderName: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.9)",
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: 5,
  },
  balanceText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  currencyBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.6)",
    textTransform: "uppercase",
    marginBottom: 1,
  },
  convertedText: {
    fontSize: 10,
    fontWeight: "500",
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
    overflow: "hidden",
  },
  limitBar: {
    height: "100%",
    borderRadius: 2,
  },
  limitLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  limitSubLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.6)",
  },
  limitValueBold: {
    fontWeight: "700",
    color: "#ffffff",
  },
})
