import { useMemo } from "react"
import {
  useListSpaceMembersQuery,
  type Space,
  type SpaceMember,
  type SpaceMember_Role,
} from "@saturn/api/saturn/space/v1/space"

export type ResolvedSpaceRole = "owner" | "admin" | "member" | "viewer"

export function mapSpaceMemberRole(
  role?: SpaceMember_Role | string
): ResolvedSpaceRole {
  switch (role?.toUpperCase()) {
    case "OWNER":
      return "owner"
    case "ADMIN":
      return "admin"
    case "MEMBER":
      return "member"
    case "VIEWER":
      return "viewer"
    default:
      return "viewer"
  }
}

export function resolveSpaceRole({
  space,
  userId,
  members,
}: {
  space?: Pick<Space, "id" | "ownerId"> | null
  userId?: string | null
  members?: Pick<SpaceMember, "userId" | "role">[]
}): ResolvedSpaceRole {
  if (!space || !userId) return "viewer"
  if (space.ownerId === userId) return "owner"
  const currentMember = members?.find((m) => m.userId === userId)
  if (!currentMember) return "viewer"
  return mapSpaceMemberRole(currentMember.role)
}

export function useSpaceRole({
  space,
  userId,
  enabled = true,
}: {
  space?: Pick<Space, "id" | "ownerId"> | null
  userId?: string | null
  enabled?: boolean
}) {
  const spaceId = space?.id ?? ""
  const isOwner = Boolean(space && userId && space.ownerId === userId)

  const { data: membersData, isLoading } = useListSpaceMembersQuery(
    {
      spaceId,
      pageSize: 100,
      pageToken: "",
    },
    {
      enabled: enabled && !!spaceId && !!userId && !isOwner,
      staleTime: 1000 * 60 * 5,
    }
  )

  const role = useMemo(
    () =>
      resolveSpaceRole({
        space,
        userId,
        members: membersData?.members,
      }),
    [space, userId, membersData?.members]
  )

  return {
    role,
    isLoading: !isOwner && isLoading,
  }
}
