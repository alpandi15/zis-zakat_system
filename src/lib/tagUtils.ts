export const normalizeTag = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ");

export const dedupeTags = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const normalized = normalizeTag(value);
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });

  return result;
};

export const matchesAllTags = (itemTags: string[] | null | undefined, selectedTags: string[]): boolean => {
  if (selectedTags.length === 0) return true;

  const availableTags = (itemTags || []).map((tag) => normalizeTag(tag).toLowerCase());
  return selectedTags.every((tag) => availableTags.includes(normalizeTag(tag).toLowerCase()));
};

export const isMissingColumnError = (
  error: unknown,
  tableName: string,
  columnName: string,
): boolean => {
  if (!error) return false;

  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";

  return (
    message.includes(`Could not find the '${columnName}' column of '${tableName}'`) ||
    message.includes(`column ${columnName} does not exist`) ||
    message.includes(`column "${columnName}" does not exist`)
  );
};
