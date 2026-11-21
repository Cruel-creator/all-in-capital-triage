"use client";
// Staggered entrance for [data-reveal] children (opacity + small rise + blur), plus scroll-in for
// [data-reveal-scroll]. Reduced motion: everything is simply visible.
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function Reveal({ children, className, as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const items = gsap.utils.toArray<HTMLElement>("[data-reveal]");
        if (items.length) gsap.from(items, { autoAlpha: 0, y: 12, filter: "blur(4px)", duration: 0.5, ease: "power3.out", stagger: 0.06, clearProps: "filter" });
        ScrollTrigger.batch("[data-reveal-scroll]", {
          start: "top 92%",
          once: true,
          onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.07 }),
        });
      });
      // safety net: if frames are paused (hidden tab, throttled device), never leave on-screen content invisible
      const t = window.setTimeout(() => {
        for (const el of gsap.utils.toArray<HTMLElement>("[data-reveal], [data-reveal-scroll]")) {
          if (el.getBoundingClientRect().top < innerHeight && Number(getComputedStyle(el).opacity) < 1) gsap.set(el, { autoAlpha: 1, y: 0, filter: "none" });
        }
      }, 2000);
      return () => {
        clearTimeout(t);
        mm.revert();
      };
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
