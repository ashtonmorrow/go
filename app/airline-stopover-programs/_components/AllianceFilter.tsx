"use client";

import { useEffect, useRef, useState } from "react";
import { ALLIANCE_STYLES, ALLIANCES, type Alliance } from "../_data/programs";

type Counts = Record<Alliance, number>;

const SECTION_IDS: Record<Alliance, string> = {
  "Star Alliance": "star-alliance",
  oneworld: "oneworld",
  SkyTeam: "skyteam",
  "Non aligned": "non-aligned",
};

/**
 * Sticky pill bar that scroll-jumps to alliance sections and tracks the
 * section currently in view. The underlying page is fully server-rendered
 * and works without JS.
 */
export function AllianceFilter({ counts }: { counts: Counts }) {
  const [active, setActive] = useState<Alliance | "all">("all");
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track which section is in view via IntersectionObserver.
  useEffect(() => {
    const sections = ALLIANCES.map((a) =>
      document.getElementById(SECTION_IDS[a])
    ).filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isUserScrollingRef.current) return;
        // Pick the entry closest to the top of the viewport that is intersecting.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!visible) return;
        const matched = ALLIANCES.find(
          (a) => SECTION_IDS[a] === visible.target.id
        );
        if (matched) setActive(matched);
      },
      {
        // Trigger when the section's top crosses ~30% down the viewport.
        rootMargin: "-30% 0px -60% 0px",
        threshold: 0,
      }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  function jumpTo(target: Alliance | "all") {
    setActive(target);
    isUserScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 800);

    if (target === "all") {
      const top = document.getElementById("programs-top");
      top?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const el = document.getElementById(SECTION_IDS[target]);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div
      className="sticky top-0 z-20 -mx-4 mb-8 flex flex-wrap gap-2 border-b border-sand bg-white/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/70 sm:-mx-6 sm:px-6"
      role="navigation"
      aria-label="Jump to alliance"
    >
      <Pill
        label="All"
        active={active === "all"}
        onClick={() => jumpTo("all")}
        accent={null}
      />
      {ALLIANCES.map((alliance) => (
        <Pill
          key={alliance}
          label={`${ALLIANCE_STYLES[alliance].label}`}
          count={counts[alliance]}
          active={active === alliance}
          onClick={() => jumpTo(alliance)}
          accent={ALLIANCE_STYLES[alliance].dot}
        />
      ))}
    </div>
  );
}

function Pill({
  label,
  count,
  active,
  onClick,
  accent,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  accent: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-small font-medium transition ${
        active
          ? "border-ink-deep bg-ink-deep text-white"
          : "border-sand bg-white text-ink hover:border-slate"
      }`}
    >
      {accent && (
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${accent}`}
        />
      )}
      <span>{label}</span>
      {typeof count === "number" && (
        <span
          className={`rounded-full px-1.5 text-label tabular-nums ${
            active
              ? "bg-white/20"
              : "bg-cream-soft text-muted"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
