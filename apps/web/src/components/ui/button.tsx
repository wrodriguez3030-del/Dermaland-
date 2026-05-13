import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-[color:var(--brand-primary)] text-white hover:bg-[color:var(--brand-accent)] active:scale-[0.98]",
  secondary:
    "bg-[color:var(--brand-fg)] text-white hover:opacity-90 active:scale-[0.98]",
  outline:
    "border border-black/15 bg-white hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]/5",
  ghost: "hover:bg-black/5",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "primary", size = "md", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
