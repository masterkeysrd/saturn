import type { ComponentType } from "react"
import type { RouteObject } from "react-router-dom"

export interface FeatureMenu {
  title: string
  url?: string
  icon: ComponentType
  weight: number
  group?: "main" | "docs"
  adminOnly?: boolean
  requiresSpace?: boolean
  badge?: ComponentType
  items?: {
    title: string
    url: string
    icon?: ComponentType
    requiresSpace?: boolean
    badge?: ComponentType
  }[]
}

export type SaturnRouteObject = RouteObject & {
  requiresSpace?: boolean
}
