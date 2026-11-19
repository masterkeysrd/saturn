import Svg, { Circle, Path } from "react-native-svg"
import { Cpu } from "lucide-react-native"
import { useTheme } from "@/lib/theme"

interface ProviderLogoProps {
  driver?: string
  size?: number
  color?: string
}

export function ProviderLogo({ driver, size = 16, color }: ProviderLogoProps) {
  const { colors } = useTheme()
  const resolvedColor = color ?? colors.textPrimary
  const normalized = (driver ?? "").toLowerCase().trim()

  switch (normalized) {
    case "gemini":
    case "google":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 2C12.3 7.3 16.7 11.7 22 12C16.7 12.3 12.3 16.7 12 22C11.7 16.7 7.3 12.3 2 12C7.3 11.7 11.7 7.3 12 2Z"
            fill={resolvedColor}
          />
        </Svg>
      )

    case "openai":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07Z"
            fill={resolvedColor}
          />
        </Svg>
      )

    case "anthropic":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M13.83 3.5h-2.78L5.2 20.5h2.66l1.2-3.6h5.88l1.2 3.6h2.66L13.83 3.5Zm-4.01 11.1L12 8.05l2.18 6.55H9.82Zm7.55-11.1h-2.46l4.94 17h2.46l-4.94-17Z"
            fill={resolvedColor}
          />
        </Svg>
      )

    case "openrouter":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle
            cx="5"
            cy="12"
            r="2.2"
            stroke={resolvedColor}
            strokeWidth="2"
          />
          <Circle
            cx="19"
            cy="6"
            r="2.2"
            stroke={resolvedColor}
            strokeWidth="2"
          />
          <Circle
            cx="19"
            cy="18"
            r="2.2"
            stroke={resolvedColor}
            strokeWidth="2"
          />
          <Path
            d="M7.2 11.2 16.8 6.8M7.2 12.8 16.8 17.2M7.2 12h6.8"
            stroke={resolvedColor}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </Svg>
      )

    case "ollama":
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M7 10V5.5C7 4.1 8 3 9 3s2 1.2 2 3v1h2V6c0-1.8 1-3 2-3s2 1.1 2 2.5V10a5.5 5.5 0 0 1 1 3.2V16a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-2.8A5.5 5.5 0 0 1 7 10Z"
            stroke={resolvedColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx="9.75" cy="13" r="0.9" fill={resolvedColor} />
          <Circle cx="14.25" cy="13" r="0.9" fill={resolvedColor} />
        </Svg>
      )

    default:
      return <Cpu size={size} color={resolvedColor} />
  }
}
