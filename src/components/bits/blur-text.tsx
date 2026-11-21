"use client";
// Adapted from React Bits "BlurText" (reactbits.dev, MIT + Commons Clause): words resolve from blur, staggered.
// Uses motion (already a dependency). Reduced motion renders plain text.
import { motion, useReducedMotion } from "motion/react";

export function BlurText({ text, className, delay = 0.06, as: Tag = "h1" }: { text: string; className?: string; delay?: number; as?: "h1" | "h2" | "p" }) {
  const reduce = useReducedMotion();
  const M = motion[Tag];
  if (reduce) return <Tag className={className}>{text}</Tag>;
  const words = text.split(" ");
  return (
    <M className={className} aria-label={text} initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: delay } } }}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block"
          variants={{ hidden: { opacity: 0, y: 8, filter: "blur(8px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: [0.2, 0, 0, 1] } } }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </M>
  );
}
