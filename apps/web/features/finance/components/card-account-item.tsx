import {
  type Account,
  type Institution,
  type Account_Type,
} from "@/gen/saturn/finance/v1/finance"
import {
  Landmark,
  CreditCard,
  Coins,
  Wallet,
  MoreVertical,
  Scale,
  Edit2,
  Check,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  formatAmount,
  getInstitutionLogoUrl,
  getCardGradient,
  getAccountTypeLabel,
} from "../utils"

function TypeIcon({
  type,
  className,
}: {
  type: Account_Type
  className?: string
}) {
  switch (type) {
    case "BANK":
      return <Landmark className={className} />
    case "CREDIT_CARD":
      return <CreditCard className={className} />
    case "CASH":
      return <Coins className={className} />
    case "DIGITAL_ACCOUNT":
      return <Wallet className={className} />
    default:
      return <Landmark className={className} />
  }
}

interface CardAccountItemProps {
  acc: Account
  institution?: Institution
  isWritable: boolean
  onHistory: () => void
  onAdjust: () => void
  onEdit: () => void
  onSetDefault?: () => void
  onDelete: () => void
}

export function CardAccountItem({
  acc,
  institution,
  isWritable,
  onHistory,
  onAdjust,
  onEdit,
  onSetDefault,
  onDelete,
}: CardAccountItemProps) {
  const theme = getCardGradient(acc.color)
  const isCredit = acc.type === "CREDIT_CARD"
  const logoUrl = getInstitutionLogoUrl(
    institution?.domain,
    institution?.name || acc.name
  )

  const rawBal = Number(acc.currentBalance || "0")
  const formattedBal = formatAmount(acc.currentBalance)

  const limit = Number(acc.creditLimit || "0")
  const debtOwed = rawBal > 0 ? rawBal : 0
  const overpayment = rawBal < 0 ? Math.abs(rawBal) : 0
  const availableCents = Math.max(0, limit - debtOwed + overpayment)
  const utilizationPercent =
    limit > 0 ? Math.min(100, Math.max(0, (debtOwed / limit) * 100)) : 0

  const maskNumber = acc.lastFour
    ? `•••• •••• •••• ${acc.lastFour}`
    : `•••• •••• •••• ••••`

  return (
    <div
      key={acc.id}
      onClick={onHistory}
      className={cn(
        "group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-3xl border p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl",
        theme.card,
        !acc.isActive && "opacity-50 grayscale"
      )}
    >
      {/* Sheen & Ambient Watermark */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/[0.08] via-transparent to-white/[0.02]" />
      <div className="pointer-events-none absolute -right-12 -bottom-12 h-44 w-44 rounded-full bg-white/[0.03] blur-2xl transition-colors group-hover:bg-white/[0.07]" />

      {/* Top Header: Logo / Bank Name & Options */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/40 shadow-inner backdrop-blur-md">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-5 w-5 object-contain"
                onError={(e) => {
                  ;(e.target as HTMLElement).style.display = "none"
                }}
              />
            ) : (
              <TypeIcon type={acc.type} className="h-5 w-5 text-white/90" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold tracking-wide text-white/90 uppercase">
              {institution?.name || acc.name}
            </span>
            <span className="text-[10px] font-medium tracking-wider text-white/50 uppercase">
              {getAccountTypeLabel(acc.type)}
            </span>
          </div>
        </div>

        <div
          className="flex shrink-0 items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {acc.isDefault && (
            <span className="rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20 px-2.5 py-0.5 text-[9px] font-black tracking-widest text-amber-300 uppercase shadow-sm backdrop-blur-md">
              Default
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <MoreVertical className="h-4.5 w-4.5" />
                </Button>
              }
            />
            <DropdownMenuContent className="rounded-xl border border-border/50 bg-card/95 p-1.5 shadow-xl backdrop-blur-xl">
              {isWritable && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onAdjust()
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-400 focus:bg-emerald-500/10"
                  >
                    <Scale className="h-3.5 w-3.5" />
                    Adjust Balance
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit()
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit Account
                  </DropdownMenuItem>
                  {!acc.isDefault && onSetDefault && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        onSetDefault()
                      }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-amber-400 focus:bg-amber-500/10"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Set as Default
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="my-1 bg-border/40" />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete()
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Account
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Masked Card Number */}
      <div className="relative z-10 my-4">
        <span className="block font-mono text-sm font-bold tracking-[0.22em] text-white/85 drop-shadow-sm">
          {maskNumber}
        </span>
      </div>

      {/* Bottom Footer Section */}
      <div className="relative z-10 space-y-3">
        {/* Upper Footer Row: Account Name & Balance Display */}
        <div className="flex items-end justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <span className="block truncate text-[10px] font-semibold tracking-wider text-white/40 uppercase">
              Account Name
            </span>
            <span className="block truncate text-xs font-bold text-white/90">
              {acc.name}
            </span>
          </div>

          <div className="shrink-0 text-right">
            <span className="block text-[10px] font-semibold tracking-wider text-white/40 uppercase">
              {isCredit
                ? rawBal > 0
                  ? "Balance Owed"
                  : "Current Credit"
                : "Available Balance"}
            </span>
            <div className="flex items-baseline justify-end gap-1">
              <span
                className={cn(
                  "text-xl font-black tracking-tight drop-shadow-sm",
                  isCredit && rawBal > 0
                    ? "text-rose-400"
                    : isCredit && rawBal < 0
                      ? "text-emerald-400"
                      : "text-white"
                )}
              >
                {formattedBal}
              </span>
              <span className="text-[10px] font-bold text-white/60 uppercase">
                {acc.currency}
              </span>
            </div>
          </div>
        </div>

        {/* Divider & Utilization Bar */}
        {isCredit && limit > 0 ? (
          <div className="space-y-1.5 pt-1">
            {/* Integrated Progress Bar Divider Line */}
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  utilizationPercent > 80
                    ? "bg-rose-500"
                    : utilizationPercent > 50
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                )}
                style={{ width: `${utilizationPercent}%` }}
              />
            </div>

            {/* Subtext Row: Available & Limit */}
            <div className="flex items-center justify-between text-[10px] font-medium text-white/60">
              <span>
                Available:{" "}
                <span className="font-bold text-white">
                  {formatAmount(availableCents, acc.currency)}
                </span>
              </span>
              <span>
                Limit:{" "}
                <span className="font-bold text-white/90">
                  {formatAmount(limit, acc.currency)}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] font-medium text-white/40">
            <span>{acc.isActive ? "Active Account" : "Inactive Account"}</span>
            <span>{acc.currency}</span>
          </div>
        )}
      </div>
    </div>
  )
}
