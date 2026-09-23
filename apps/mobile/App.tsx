import React, { useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { configureClient } from "@saturn/api/client"
import { useListSpacesQuery } from "@saturn/api/saturn/space/v1/space"
import { formatAmount, formatCents, getBudgetColors } from "@saturn/core"
import { transactionSchema } from "@saturn/schemas"
import { mobileStorage } from "./lib/storage"

// Initialize Saturn client for mobile with SecureStore adapter
configureClient({
  baseUrl: "http://localhost:8080",
  storage: mobileStorage,
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60,
    },
  },
})

function SaturnHomeScreen() {
  const { data: spacesData, isLoading } = useListSpacesQuery({
    pageSize: 10,
    pageToken: "",
  })

  const [testAmount, setTestAmount] = useState("12500")
  const [description, setDescription] = useState("Sample Grocery")
  const [validationResult, setValidationResult] = useState<string | null>(null)

  const handleValidateForm = () => {
    const result = transactionSchema.safeParse({
      budgetId: "default-budget",
      description,
      amount: testAmount,
      currency: "USD",
      transactionDate: new Date(),
      hasCustomEffectiveDate: false,
      effectiveDate: new Date(),
    })

    if (result.success) {
      setValidationResult(
        `Valid transaction: ${result.data.description} (${formatAmount(result.data.amount, result.data.currency)})`
      )
    } else {
      setValidationResult(
        `Validation error: ${result.error.errors[0]?.message}`
      )
    }
  }

  const indigoColor = getBudgetColors("indigo")
  const emeraldColor = getBudgetColors("emerald")

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.appName}>🪐 Saturn Mobile</Text>
          <Text style={styles.subtitle}>Personal Life OS</Text>
        </View>

        {/* Shared Core Math & Formatting Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Shared Domain Logic (@saturn/core)
          </Text>
          <Text style={styles.itemText}>
            Formatted Balance:{" "}
            <Text style={styles.boldText}>{formatAmount("145025", "USD")}</Text>
          </Text>
          <Text style={styles.itemText}>
            Parsed Cents:{" "}
            <Text style={styles.boldText}>{formatCents(145025)} units</Text>
          </Text>
          <Text style={styles.itemText}>
            Color Palette Theme:{" "}
            <Text style={{ color: "#818cf8", fontWeight: "600" }}>
              {indigoColor.name} & {emeraldColor.name}
            </Text>
          </Text>
        </View>

        {/* Shared Schemas Validation Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Shared Zod Schemas (@saturn/schemas)
          </Text>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>Amount (in USD)</Text>
          <TextInput
            style={styles.input}
            value={testAmount}
            onChangeText={setTestAmount}
            keyboardType="numeric"
            placeholderTextColor="#64748b"
          />

          <TouchableOpacity style={styles.button} onPress={handleValidateForm}>
            <Text style={styles.buttonText}>
              Validate with transactionSchema
            </Text>
          </TouchableOpacity>

          {validationResult && (
            <Text style={styles.validationText}>{validationResult}</Text>
          )}
        </View>

        {/* Shared API Client Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Shared API & Queries (@saturn/api)
          </Text>
          {isLoading ? (
            <Text style={styles.itemText}>Loading spaces from backend...</Text>
          ) : spacesData?.spaces?.length ? (
            spacesData.spaces.map((space) => (
              <View key={space.id || space.name} style={styles.spaceRow}>
                <Text style={styles.spaceName}>{space.name}</Text>
                <Text style={styles.spaceRole}>{space.id || "Active"}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.itemText}>
              No spaces found or backend offline. Client ready for live sync!
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SaturnHomeScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090d16",
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  header: {
    marginBottom: 8,
    marginTop: 10,
  },
  appName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#f8fafc",
  },
  subtitle: {
    fontSize: 15,
    color: "#94a3b8",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#38bdf8",
    marginBottom: 4,
  },
  itemText: {
    fontSize: 14,
    color: "#cbd5e1",
  },
  boldText: {
    fontWeight: "bold",
    color: "#f8fafc",
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 6,
  },
  input: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    padding: 10,
    color: "#f8fafc",
    fontSize: 14,
  },
  button: {
    backgroundColor: "#4f46e5",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  validationText: {
    fontSize: 13,
    color: "#34d399",
    marginTop: 6,
  },
  spaceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  spaceName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "500",
  },
  spaceRole: {
    color: "#94a3b8",
    fontSize: 13,
  },
})
