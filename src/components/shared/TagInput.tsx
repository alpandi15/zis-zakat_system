import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Plus } from "lucide-react";
import { dedupeTags, normalizeTag } from "@/lib/tagUtils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Ketik tag lalu tekan Enter",
  disabled,
  helperText,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const availableSuggestions = useMemo(
    () =>
      dedupeTags(suggestions).filter(
        (tag) => !value.some((selectedTag) => selectedTag.toLowerCase() === tag.toLowerCase()),
      ),
    [suggestions, value],
  );

  const addTag = (rawValue: string) => {
    const normalized = normalizeTag(rawValue);
    if (!normalized) return;
    onChange(dedupeTags([...value, normalized]));
    setInputValue("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag.toLowerCase() !== tagToRemove.toLowerCase()));
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 rounded-full px-3 py-1">
              <span>{tag}</span>
              {!disabled && (
                <button
                  type="button"
                  className="rounded-full opacity-70 transition hover:opacity-100"
                  onClick={() => removeTag(tag)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          <div className="flex min-w-[220px] flex-1 items-center gap-2">
            <Input
              value={inputValue}
              disabled={disabled}
              placeholder={placeholder}
              className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addTag(inputValue);
                }
                if (event.key === "Backspace" && !inputValue && value.length > 0) {
                  removeTag(value[value.length - 1]);
                }
              }}
            />
            {!disabled && (
              <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => addTag(inputValue)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Tambah
              </Button>
            )}
          </div>
        </div>
      </div>

      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}

      {availableSuggestions.length > 0 && (
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-2 pb-1">
            {availableSuggestions.map((tag) => (
              <Button
                key={tag}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => addTag(tag)}
              >
                {tag}
              </Button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
