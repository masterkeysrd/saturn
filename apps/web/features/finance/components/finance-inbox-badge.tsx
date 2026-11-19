import { useListInboxItemsQuery } from "@saturn/api/gen/saturn/finance/v1/finance"
import { useActiveSpaceContext } from "@/features/space/use-space"

export function FinanceInboxBadge() {
  const { spaceId } = useActiveSpaceContext()
  const { data } = useListInboxItemsQuery(
    {
      status: "PENDING",
      pageSize: 100,
      pageToken: "",
      sort: "",
      view: "BASIC",
    },
    { enabled: Boolean(spaceId) }
  )

  const count = data?.inboxItems?.length ?? 0
  if (count <= 0) return null

  const label = data?.nextPageToken || count > 99 ? "99+" : String(count)

  return (
    <span
      data-testid="finance-inbox-badge"
      className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary tabular-nums"
    >
      {label}
    </span>
  )
}
