import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = "0",
  className,
  disabled,
  id,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value === 0) {
      setDisplayValue("");
    } else {
      setDisplayValue(value.toLocaleString("id-ID"));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^\d]/g, "");
    const numValue = parseInt(rawValue, 10) || 0;
    
    if (rawValue === "") {
      setDisplayValue("");
      onChange(0);
    } else {
      setDisplayValue(numValue.toLocaleString("id-ID"));
      onChange(numValue);
    }
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground sm:text-sm">
        Rp
      </span>
      <Input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("pl-8 text-right text-sm sm:pl-10", className)}
      />
    </div>
  );
}
