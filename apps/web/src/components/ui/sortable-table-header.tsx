"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TH } from "./table";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K | null;
  direction: SortDirection;
}

/**
 * Hook ligero para tablas ordenables.
 *
 * Recibe la lista, la key + dirección por defecto y un mapa de comparadores
 * por columna. Devuelve `sorted`, `sort` (estado actual) y `toggle(key)`.
 *
 * Pattern:
 *   const cmp = {
 *     date: (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
 *     name: (a, b) => a.name.localeCompare(b.name),
 *   };
 *   const { sort, sorted, toggle } = useTableSort(items, "date", "desc", cmp);
 *
 * En el TH:
 *   <SortableTH sortKey="date" state={sort} onClick={toggle}>Fecha</SortableTH>
 *
 * Click 1 → asc · Click 2 → desc · estable a partir de ahí (no rota a "ninguno").
 */
export function useTableSort<
  T,
  C extends Record<string, (a: T, b: T) => number>,
>(
  items: T[],
  defaultKey: keyof C & string,
  defaultDirection: SortDirection,
  comparators: C,
) {
  type K = keyof C & string;

  const [sort, setSort] = React.useState<SortState<K>>({
    key: defaultKey,
    direction: defaultDirection,
  });

  const sorted = React.useMemo(() => {
    if (!sort.key) return items;
    const cmp = comparators[sort.key];
    if (!cmp) return items;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...items].sort((a, b) => factor * cmp(a, b));
  }, [items, sort, comparators]);

  const toggle = React.useCallback((key: K) => {
    setSort((prev) =>
      prev.key === key
        ? {
            key,
            direction: prev.direction === "asc" ? "desc" : "asc",
          }
        : { key, direction: "asc" },
    );
  }, []);

  return { sort, sorted, toggle };
}

interface SortableTHProps<K extends string>
  extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, "onClick"> {
  sortKey: K;
  state: SortState<K>;
  onClick: (key: K) => void;
  align?: "left" | "right" | "center";
  children: React.ReactNode;
}

export function SortableTH<K extends string>({
  sortKey,
  state,
  onClick,
  children,
  className,
  align = "left",
  ...rest
}: SortableTHProps<K>) {
  const active = state.key === sortKey;
  const Arrow = !active
    ? ArrowUpDown
    : state.direction === "asc"
      ? ArrowUp
      : ArrowDown;

  const justify =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start";

  return (
    <TH
      className={cn(
        "cursor-pointer select-none transition hover:text-[color:var(--brand-fg)]",
        align === "right" && "text-right",
        align === "center" && "text-center",
        active && "text-[color:var(--brand-fg)]",
        className,
      )}
      aria-sort={
        active
          ? state.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      {...rest}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex w-full items-center gap-1 text-inherit",
          justify,
        )}
      >
        {children}
        <Arrow
          className={cn(
            "h-3 w-3 shrink-0 transition",
            active ? "opacity-100" : "opacity-30",
          )}
          aria-hidden
        />
      </button>
    </TH>
  );
}
