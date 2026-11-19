export function isMailAccountReauthRequired(
  account?: {
    status?: string | null
    enabledCapabilities?: string[] | null
  } | null
): boolean {
  if (!account?.status) return false
  return account.status.toLowerCase().includes("reauth")
}

export function filterReauthMailAccounts<
  T extends {
    id?: string
    status?: string
    enabledCapabilities?: string[]
  },
>(accounts: readonly T[] | undefined, selectedAccountId?: string): T[] {
  if (!accounts || accounts.length === 0) return []
  return accounts.filter((account) => {
    const isMailCapable =
      !account.enabledCapabilities ||
      account.enabledCapabilities.length === 0 ||
      account.enabledCapabilities.some((c) => c.toLowerCase() === "mail")
    if (!isMailCapable) return false
    if (selectedAccountId && account.id !== selectedAccountId) return false
    return isMailAccountReauthRequired(account)
  })
}
