/**
 * Format a number as Indonesian Rupiah currency
 */
export function formatCurrency(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

/**
 * Parse a currency string back to number
 */
export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^\d]/g, "");
  return parseInt(cleaned, 10) || 0;
}

/**
 * Format number input with thousand separators (for display in inputs)
 */
export function formatNumberInput(value: number | string): string {
  const num = typeof value === "string" ? parseCurrency(value) : value;
  if (isNaN(num) || num === 0) return "";
  return num.toLocaleString("id-ID");
}
