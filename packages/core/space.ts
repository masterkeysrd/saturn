export type SpaceRoleValue =
  "ROLE_UNSPECIFIED" | "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"

export type AssignableSpaceRole = "ADMIN" | "MEMBER" | "VIEWER"

export interface SpaceRoleOption {
  label: string
  value: AssignableSpaceRole
}

export const SPACE_ROLE_LABELS: Record<SpaceRoleValue, string> = {
  ROLE_UNSPECIFIED: "Unspecified",
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
}

export const SPACE_ROLE_OPTIONS: readonly SpaceRoleOption[] = [
  { label: "Admin", value: "ADMIN" },
  { label: "Member", value: "MEMBER" },
  { label: "Viewer", value: "VIEWER" },
]
