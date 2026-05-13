"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  containerClassName?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    { className, containerClassName, placeholder = "Buscar…", ...props },
    ref,
  ) {
    return (
      <div className={cn("relative", containerClassName)}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
        <input
          ref={ref}
          type="search"
          placeholder={placeholder}
          className={cn(
            "h-10 w-full rounded-lg border border-black/15 bg-white pl-9 pr-3 text-sm placeholder:text-black/40 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
