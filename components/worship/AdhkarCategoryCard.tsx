"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/IconBadge";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import type { AdhkarCategory } from "@/lib/islamic/types";
import { 
  ChevronLeft,
  CheckCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface AdhkarCategoryCardProps {
  category: AdhkarCategory;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  progress: number;
  completed: boolean;
  count: number;
  total: number;
  href: string;
  index: number;
}

export function AdhkarCategoryCard({
  label,
  description,
  icon: Icon,
  color,
  bg,
  progress,
  completed,
  count,
  total,
  href,
  index,
}: AdhkarCategoryCardProps) {
  return (
    <Reveal index={index}>
      <Link href={href} className="block">
        <GlassCard className={cn(
          "p-5 h-full transition-all hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)]",
          completed ? "border-[#2DD4BF]/30" : "border-white/[0.06]"
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconBadge icon={Icon} color={color} bg={bg} size={48} />
              <div>
                <p className="text-lg font-bold text-white">{label}</p>
                <p className="text-sm text-[#9AA0C0]">{description}</p>
              </div>
            </div>
            {completed && (
              <IconBadge icon={CheckCircle} color="text-[#2DD4BF]" bg="bg-[#2DD4BF]/15" size={32} />
            )}
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#9AA0C0]">التقدم</span>
              <span className="font-mono font-bold text-white">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${color.replace("text-", "")}80, ${color.replace("text-", "")})`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[#9AA0C0]">
              <span>{count} / {total} أذكار</span>
              {completed && <span className="text-[#2DD4BF] font-medium">مكتمل ✓</span>}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/[0.04]">
            <Button variant="ghost" className="w-full justify-center" aria-label={`فتح ${label}`}>
              {completed ? "مراجعة" : "بدء القراءة"}
              <ChevronLeft size={16} className="ml-1" aria-hidden />
            </Button>
          </div>
        </GlassCard>
      </Link>
    </Reveal>
  );
}