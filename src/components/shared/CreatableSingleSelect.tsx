import { useMemo, useState } from "react";
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

interface CreatableSingleSelectProps {
  value: string;
  onChange: (value: string) => void;
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

const normalizeValue = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ");

export function CreatableSingleSelect({
  value,
  onChange,
  options,
  placeholder = "Pilih data",
  searchPlaceholder = "Cari data...",
  emptyLabel = "Data tidak ditemukan",
  helperText,
  disabled,
  allowCreate = true,
  portalled = true,
  className,
}: CreatableSingleSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const normalizedOptions = useMemo(() => {
    const seen = new Set<string>();
    return options
      .map(normalizeValue)
      .filter(Boolean)
      .filter((option) => {
        const key = option.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [options]);

  const filteredOptions = useMemo(() => {
    const query = normalizeValue(search).toLowerCase();
    if (!query) return normalizedOptions;
    return normalizedOptions.filter((option) => option.toLowerCase().includes(query));
  }, [normalizedOptions, search]);

  const normalizedSearch = normalizeValue(search);
  const canCreate =
    allowCreate &&
    normalizedSearch.length > 0 &&
    !normalizedOptions.some((option) => option.toLowerCase() === normalizedSearch.toLowerCase());

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setSearch("");
    setOpen(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-11 w-full justify-between rounded-xl border-border/70 bg-background/80 px-3 text-left font-normal"
          >
            <span className={cn("truncate text-sm", value ? "text-foreground" : "text-muted-foreground")}>
              {value || placeholder}
            </span>
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
              {value && (
                <CommandGroup heading="Aksi">
                  <CommandItem value="__clear__" onSelect={() => handleSelect("")}>
                    <X className="mr-2 h-4 w-4" />
                    Hapus pilihan
                  </CommandItem>
                </CommandGroup>
              )}
              {canCreate && (
                <CommandGroup heading="Tambah Baru">
                  <CommandItem value={`create-${normalizedSearch}`} onSelect={() => handleSelect(normalizedSearch)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Buat "{normalizedSearch}"
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup heading="Data Tersedia">
                {filteredOptions.map((option) => {
                  const selected = value.toLowerCase() === option.toLowerCase();
                  return (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => handleSelect(option)}
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

      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}
