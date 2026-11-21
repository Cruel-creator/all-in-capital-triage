"use client";
// Adapted from React Bits "SpotlightCard" (reactbits.dev, MIT + Commons Clause): a soft light follows the
// pointer across the card. Pure CSS variables, no re-render per move.
import { useRef } from "react";
import { cx } from "../ui";

export function SpotlightCard({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
        ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={cx("spotlight relative overflow-hidden", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
