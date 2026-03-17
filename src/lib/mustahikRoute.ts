export interface MustahikRouteFields {
  name?: string | null;
  distribution_rt?: string | null;
  distribution_lane?: string | null;
  delivery_order?: number | null;
}

export const mustahikRouteCollator = new Intl.Collator("id", {
  numeric: true,
  sensitivity: "base",
});

const compareNullableText = (a?: string | null, b?: string | null): number => {
  const left = a?.trim() || "";
  const right = b?.trim() || "";

  if (left && !right) return -1;
  if (!left && right) return 1;
  if (!left && !right) return 0;

  return mustahikRouteCollator.compare(left, right);
};

const compareNullableNumber = (a?: number | null, b?: number | null): number => {
  if (typeof a === "number" && typeof b !== "number") return -1;
  if (typeof a !== "number" && typeof b === "number") return 1;
  if (typeof a !== "number" && typeof b !== "number") return 0;
  return (a || 0) - (b || 0);
};

export const compareMustahikRoute = <T extends MustahikRouteFields>(left: T, right: T): number => {
  const byRt = compareNullableText(left.distribution_rt, right.distribution_rt);
  if (byRt !== 0) return byRt;

  const byLane = compareNullableText(left.distribution_lane, right.distribution_lane);
  if (byLane !== 0) return byLane;

  const byOrder = compareNullableNumber(left.delivery_order, right.delivery_order);
  if (byOrder !== 0) return byOrder;

  return mustahikRouteCollator.compare(left.name || "", right.name || "");
};

export const sortMustahikByRoute = <T extends MustahikRouteFields>(items: T[]): T[] =>
  [...items].sort(compareMustahikRoute);

export const formatMustahikRoute = (item: MustahikRouteFields): string => {
  const parts: string[] = [];
  if (item.distribution_rt) parts.push(item.distribution_rt);
  if (item.distribution_lane) parts.push(item.distribution_lane);
  if (typeof item.delivery_order === "number") parts.push(`Urut ${item.delivery_order}`);
  return parts.join(" • ");
};
