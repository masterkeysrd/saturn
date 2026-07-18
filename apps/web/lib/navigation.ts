import type { ComponentType } from "react"

export interface FeatureMenu {
  title: string
  url: string
  icon: ComponentType
  weight: number
  group?: "main" | "docs"
}
