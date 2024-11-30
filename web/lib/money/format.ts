export function format(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencySign: "accounting",
  }).format(amount / 100);
}
