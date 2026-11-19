import type { ComponentType } from "react"
import type { RouteObject } from "react-router-dom"

export type SidebarNavGroup =
  "pulse" | "money" | "automation" | "admin" | "main" | "docs"

export interface FeatureMenu {
  title: string
  url?: string
  icon: ComponentType
  weight: number
  group?: SidebarNavGroup
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
