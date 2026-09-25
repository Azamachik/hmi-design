import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-surface hover:bg-ink/85 active:bg-ink/75",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-soft active:bg-line",
  ghost: "text-muted hover:bg-soft hover:text-ink",
};

/** Классы кнопки, чтобы оформить ссылку так же, как <button>. */
export function buttonStyles(variant: Variant = "primary", className = "") {
  return `${BASE} ${VARIANTS[variant]} ${className}`.trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "primary", className, type = "button", ...props }: Props) {
  return <button type={type} className={buttonStyles(variant, className)} {...props} />;
}
