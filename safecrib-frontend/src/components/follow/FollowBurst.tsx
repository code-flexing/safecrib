"use client";

import { useEffect, useRef } from "react";
import { release } from "@/lib/burst-registry";

const FOLLOW_PARTICLE_OFFSETS = [
  { dx: -18, dy: -14, rot: 45, delay: 0, dur: 550 },
  { dx: 20, dy: -12, rot: -30, delay: 40, dur: 600 },
  { dx: -12, dy: 16, rot: 72, delay: 80, dur: 500 },
  { dx: 16, dy: 14, rot: -60, delay: 110, dur: 580 },
  { dx: 0, dy: -22, rot: 0, delay: 20, dur: 650 },
  { dx: 24, dy: 6, rot: 15, delay: 60, dur: 520 },
];

const FOLLOW_COLORS = ["#0c7355", "#12a150", "#1fae7a", "#6de0b5", "#8fe6b7", "#a7f3d0"];

interface FollowBurstProps {
  burstId: string;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

export function FollowBurst({ burstId, buttonRef }: FollowBurstProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let settled = false;
    const handleAnimationEnd = (e: AnimationEvent) => {
      if (settled) return;
      if (e.animationName === "follow-sparkle-pop" || e.animationName === "follow-ring-pulse") {
        settled = true;
        release(`follow:${buttonRef.current?.dataset.targetKey ?? ""}`, burstId);
        const timeout = setTimeout(() => {
          if (container) container.remove();
        }, 800);
        return () => clearTimeout(timeout);
      }
    };
    container.addEventListener("animationend", handleAnimationEnd);
    return () => container.removeEventListener("animationend", handleAnimationEnd);
  }, [burstId, buttonRef]);

  const particles = FOLLOW_PARTICLE_OFFSETS.map((p, i) => {
    const color = FOLLOW_COLORS[i % FOLLOW_COLORS.length];
    const style: React.CSSProperties & Record<string, string> = {
      "--dx": `${p.dx}px`,
      "--dy": `${p.dy}px`,
      "--rot": `${p.rot}deg`,
      animationDelay: `${p.delay}ms`,
      animationDuration: `${p.dur}ms`,
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };

    return (
      <span key={"particle-" + i} className="follow-sparkle" style={style} aria-hidden="true">
        <svg width="6" height="6" viewBox="0 0 24 24" fill={color} style={{ transform: "scale(0.5)" }}>
          <path d="M12 2l1 4 4 1-1 4 1 4-4 1-4-1 1-4-1-4 4-1 1 4Z" />
        </svg>
      </span>
    );
  });

  const ring = (
    <span
      className="follow-ring"
      style={{
        position: "absolute",
        inset: "-4px",
        borderRadius: "9999px",
        border: "2px solid #0c7355",
        opacity: 0,
        animation: "follow-ring-pulse 450ms ease-out both",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );

  return (
    <div
      ref={containerRef}
      className="safecrib-burst"
      style={{ left: "0", top: "0", width: "1px", height: "1px" }}
      aria-hidden="true"
    >
      {ring}
      {particles}
    </div>
  );
}