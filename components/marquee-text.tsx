"use client";

import React, { useEffect, useRef, useState } from "react";

interface MarqueeTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  active?: boolean;
}

export function MarqueeText({
  text,
  className = "",
  style,
  active = false,
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    let rafId: number | null = null;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const containerWidth = container.clientWidth;
      if (containerWidth === 0) return;

      // Temporarily unconstrain max-width to read true natural scrollWidth
      const prevMaxWidth = track.style.maxWidth;
      track.style.maxWidth = "none";
      const textWidth = track.scrollWidth;
      track.style.maxWidth = prevMaxWidth;

      const diff = textWidth - containerWidth;

      if (diff > 2) {
        // Extra 8px buffer so the last characters have comfortable breathing room
        const offset = diff + 8;
        // Comfortable reading speed: between 4s and 10s based on overflow length
        const duration = Math.max(4, Math.min(10, Math.round(diff / 25) + 3));
        track.style.setProperty("--marquee-dist", `-${offset}px`);
        track.style.setProperty("--marquee-duration", `${duration}s`);
        setIsOverflowing(true);
      } else {
        track.style.removeProperty("--marquee-dist");
        track.style.removeProperty("--marquee-duration");
        setIsOverflowing(false);
      }
    };

    const scheduleMeasure = () => {
      if (cancelled) return;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        measure();
      });
    };

    scheduleMeasure();

    const ro = new ResizeObserver(() => {
      scheduleMeasure();
    });
    ro.observe(container);

    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(scheduleMeasure);
    }

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      ro.disconnect();
    };
  }, [text, active]);

  return (
    <span
      ref={containerRef}
      className={`marquee-text-container ${className}`}
      style={style}
    >
      <span
        ref={trackRef}
        className={`marquee-text-track ${isOverflowing ? "is-overflowing" : ""} ${active ? "is-active" : ""}`}
      >
        {text}
      </span>
    </span>
  );
}
