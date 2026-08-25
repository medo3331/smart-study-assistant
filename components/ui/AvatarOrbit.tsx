"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { User } from "@/lib/types";

interface AvatarOrbitProps {
  user: User;
  /** Diameter of the avatar disc (px). */
  size?: number;
  className?: string;
}

/**
 * SIGNATURE ELEMENT (hero).
 *
 * Circular violet-gradient avatar with a glowing border/shadow, a single amber
 * dot orbiting around it (the streak indicator — animated, not decorative), and
 * an amber LV badge showing the learner's level. The orbiting dot is the
 * streak readout; its presence/animation makes a live streak visible at a
 * glance. (Dot-count variant from an earlier iteration is intentionally
 * replaced by this single, calmer streak orb per the approved target design.)
 */
export function AvatarOrbit({ user, size = 96, className }: AvatarOrbitProps) {
  const orbit = size + 18; // dot center distance from middle

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: orbit + 24, height: orbit + 24 }}
    >
      {/* Orbiting amber streak dot (slow ambient rotation) */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 9, ease: "linear", repeat: Infinity }}
        style={{ transformOrigin: "center" }}
        aria-hidden
      >
        <span
          className="absolute left-1/2 top-1/2 rounded-full bg-[#FB923C]"
          style={{
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            boxShadow: "0 0 12px #FB923C",
            transform: `translateY(-${orbit / 2}px)`,
          }}
        />
      </motion.div>

      {/* Glowing violet avatar disc */}
      <div
        className="relative z-10 overflow-hidden rounded-full"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(160deg, #7C5CFF 0%, #9A7BFF 100%)",
          boxShadow:
            "0 0 0 3px rgba(124,92,255,0.5), 0 0 28px rgba(124,92,255,0.55)",
        }}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-sans text-3xl font-bold text-white">
            {user.initials}
          </span>
        )}
      </div>

      {/* LV badge — amber, the ONLY yellow in the UI */}
      <span
        className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#FB923C] font-mono text-[11px] font-bold text-[#231402]"
        style={{ padding: "2px 10px", boxShadow: "0 0 14px rgba(251,146,60,0.6)" }}
        dir="ltr"
      >
        LV {user.level}
      </span>
    </div>
  );
}
