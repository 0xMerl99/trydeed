import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

type Variant = "default" | "gold" | "ink" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Common {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
  className?: string;
}
type ButtonProps = Common & { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>;
type LinkProps = Common & { href: string; external?: boolean } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

const cls = (v: Variant, s: Size, block?: boolean, extra?: string) =>
  cn("btn", v === "gold" && "btn-gold", v === "ink" && "btn-ink", v === "ghost" && "btn-ghost", v === "danger" && "btn-danger", s === "sm" && "btn-sm", s === "lg" && "btn-lg", block && "btn-block", extra);

/** Button or link-styled-as-button. External links open in a new tab with `noopener noreferrer`. */
export function Button(props: ButtonProps | LinkProps) {
  const { variant = "default", size = "md", block, className, children } = props;
  if ("href" in props && props.href !== undefined) {
    const { href, external, variant: _v, size: _s, block: _b, className: _c, children: _ch, ...rest } = props as LinkProps;
    return external || /^https?:/.test(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls(variant, size, block, className)} {...rest}>
        {children}
      </a>
    ) : (
      <Link href={href} className={cls(variant, size, block, className)} {...rest}>
        {children}
      </Link>
    );
  }
  const { variant: _v, size: _s, block: _b, className: _c, children: _ch, type = "button", ...rest } = props as ButtonProps;
  return (
    <button type={type} className={cls(variant, size, block, className)} {...rest}>
      {children}
    </button>
  );
}
