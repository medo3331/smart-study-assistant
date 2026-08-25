"use client";

import { useMemo } from "react";
import { Compass, Navigation } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Reveal } from "@/components/ui/Reveal";
import { useIslamicSettings } from "@/hooks/useIslamicSettings";

interface QiblaCardProps {
  index?: number;
}

const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

/**
 * Great-circle initial bearing from the user's location to the Kaaba.
 * Standard formula; returns degrees clockwise from true north (0–360).
 */
function qiblaBearing(lat: number, lng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const dLng = toRad(KAABA_LNG - lng);
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA_LAT);

  const y = Math.sin(dLng);
  const x =
    Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(dLng);
  let bearing = toDeg(Math.atan2(y, x));
  if (bearing < 0) bearing += 360;
  return bearing;
}

/** Rough great-circle distance in km. */
function distanceKm(lat: number, lng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(KAABA_LAT - lat);
  const dLng = toRad(KAABA_LNG - lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) * Math.cos(toRad(KAABA_LAT)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Tiny stylized Kaaba glyph at the needle tip. */
function KaabaIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
      <rect x={2} y={3} width={8} height={7} rx={1} fill="#E7E9F5" />
      <rect x={2} y={5} width={8} height={1.4} fill="#B5905A" />
    </svg>
  );
}

/**
 * Qibla direction card.
 *
 * Computes the bearing to the Kaaba locally from the user's saved Islamic
 * settings coordinates — no external API needed. Shows a compass dial with
 * the needle rotated to the qibla bearing and the distance in km.
 */
export function QiblaCard({ index = 0 }: QiblaCardProps) {
  const { settings } = useIslamicSettings();
  const bearing = useMemo(
    () => qiblaBearing(settings.latitude, settings.longitude),
    [settings.latitude, settings.longitude]
  );
  const distance = useMemo(
    () => distanceKm(settings.latitude, settings.longitude),
    [settings.latitude, settings.longitude]
  );

  return (
    <Reveal index={index}>
      <GlassCard className="p-5">
        <div className="flex items-center gap-5">
          {/* Compass dial */}
          <div
            className="relative h-24 w-24 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.02]"
            role="img"
            aria-label={`اتجاه القبلة ${Math.round(bearing)} درجة من الشمال`}
          >
            {/* Cardinal marks */}
            <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[10px] text-[#9AA0C0]" dir="rtl">
              ش
            </span>
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] text-[#9AA0C0]" dir="rtl">
              ج
            </span>
            <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[10px] text-[#9AA0C0]" dir="rtl">
              ق
            </span>
            <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[10px] text-[#9AA0C0]" dir="rtl">
              ر
            </span>

            {/* Needle pointing at the qibla bearing */}
            <div
              className="absolute inset-0 flex items-start justify-center"
              style={{
                transform: `rotate(${bearing}deg)`,
                transition: "transform 0.6s ease-out",
              }}
            >
              <div className="flex flex-col items-center pt-3">
                <span
                  className="block h-9 w-0 border-l-[7px] border-r-[7px] border-b-[30px]"
                  style={{
                    borderLeftColor: "transparent",
                    borderRightColor: "transparent",
                    borderBottomColor: "#2DD4BF",
                  }}
                />
                <KaabaIcon />
              </div>
            </div>

            {/* Center hub */}
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <Compass size={18} className="text-[#2DD4BF]" aria-hidden />
              اتجاه القبلة
            </h2>
            <p className="mt-1 text-sm text-[#9AA0C0]">
              من موقعك المحفوظ، القبلة تقع بزاوية{" "}
              <span className="font-mono font-bold text-[#2DD4BF]">
                {Math.round(bearing)}°
              </span>{" "}
              من الشمال
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-[#9AA0C0]">
              <Navigation size={12} aria-hidden />
              المسافة إلى الكعبة ≈{" "}
              <span className="font-mono text-[#C7CBE6]">
                {distance.toLocaleString("ar-EG")}
              </span>{" "}
              كم
            </p>
          </div>
        </div>
      </GlassCard>
    </Reveal>
  );
}
