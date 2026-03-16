import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { dedupeTags, normalizeTag } from "@/lib/tagUtils";

interface TagMultiSelectProps {
  value: string[];
  onChange: (tags: string[]) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  helperText?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  portalled?: boolean;
  className?: string;
}

export function TagMultiSelect({
  value,
  onChange,
  options,
  placeholder = "Pilih tags",
  searchPlaceholder = "Cari tags...",
  emptyLabel = "Tag tidak ditemukan",
  helperText,
  disabled,
  allowCreate = false,
  portalled = true,
  className,
}: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const normalizedOptions = useMemo(() => dedupeTags(options), [options]);
  const filteredOptions = useMemo(() => {
    const query = normalizeTag(search).toLowerCase();
    if (!query) return normalizedOptions;
    return normalizedOptions.filter((option) => option.toLowerCase().includes(query));
  }, [normalizedOptions, search]);

  const normalizedSearch = normalizeTag(search);
  const canCreate =
    allowCreate &&
    normalizedSearch.length > 0 &&
    !normalizedOptions.some((option) => option.toLowerCase() === normalizedSearch.toLowerCase()) &&
    !value.some((tag) => tag.toLowerCase() === normalizedSearch.toLowerCase());

  const toggleTag = (tag: string) => {
    const exists = value.some((item) => item.toLowerCase() === tag.toLowerCase());
    if (exists) {
      onChange(value.filter((item) => item.toLowerCase() !== tag.toLowerCase()));
      return;
    }
    onChange(dedupeTags([...value, tag]));
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((item) => item.toLowerCase() !== tag.toLowerCase()));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-auto min-h-11 w-full justify-between rounded-2xl border-border/70 bg-background/80 px-3 py-2 text-left font-normal"
          >
            <div className="flex min-h-6 flex-1 flex-wrap gap-1.5 pr-3">
              {value.length > 0 ? (
                value.map((tag) => (
                  <Badge key={tag} variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px]">
                    {tag}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          portalled={portalled}
          align="start"
          sideOffset={8}
          className="w-[var(--radix-popover-trigger-width)] rounded-2xl border-border/70 p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              {canCreate && (
                <CommandGroup heading="Tambah Baru">
                  <CommandItem
                    value={`create-${normalizedSearch}`}
                    onSelect={() => {
                      toggleTag(normalizedSearch);
                      setSearch("");
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Buat tag "{normalizedSearch}"
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup heading="Tags">
                {filteredOptions.map((option) => {
                  const selected = value.some((item) => item.toLowerCase() === option.toLowerCase());
                  return (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => toggleTag(option)}
                      className="justify-between"
                    >
                      <span>{option}</span>
                      <Check className={cn("h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <button
              key={tag}
              type="button"
              disabled={disabled}
              onClick={() => removeTag(tag)}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-[11px] text-foreground transition hover:bg-muted"
            >
              <span>{tag}</span>
              <X className="h-3 w-3 opacity-60" />
            </button>
          ))}
        </div>
      )}

      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}
