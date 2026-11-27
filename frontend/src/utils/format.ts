export function formatINRCompact(amount: number): { main: string; exact: string } {
  const exact = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

  if (amount >= 1e7) {
    return { main: `₹${(amount / 1e7).toFixed(2)} Cr`, exact };
  }
  if (amount >= 1e5) {
    return { main: `₹${(amount / 1e5).toFixed(2)} L`, exact };
  }
  return { main: exact, exact };
}

export function formatIndianNumber(value: number, decimals = 1): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals > 0 && !Number.isInteger(value) ? 1 : 0,
  }).format(value);
}
