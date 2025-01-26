export function format(amount?: number) {
  if (amount === undefined) {
    amount = 0;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencySign: "accounting",
  }).format(amount / 100);
}
