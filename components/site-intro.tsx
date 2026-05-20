"use client";

import { useEffect, useState } from "react";
import AnimatedShaderHero from "@/components/ui/animated-shader-hero";
import { cn } from "@/lib/utils";

const INTRO_DURATION_MS = 2400;
const FADE_DURATION_MS = 600;

export function SiteIntro() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => {
      setLeaving(true);
    }, INTRO_DURATION_MS);

    const removeTimer = window.setTimeout(() => {
      setVisible(false);
    }, INTRO_DURATION_MS + FADE_DURATION_MS);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  const dismiss = () => {
    setLeaving(true);
    window.setTimeout(() => {
      setVisible(false);
    }, FADE_DURATION_MS);
  };

  if (!visible) return null;

  return (
    <div
      aria-label="进入网站动画"
      className={cn(
        "fixed inset-0 z-[100] bg-black transition-opacity duration-700",
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      )}
    >
      <AnimatedShaderHero
        trustBadge={{
          text: "正在进入换品片场",
          icons: ["✨"]
        }}
        headline={{
          line1: "换品片场",
          line2: "AI 商品替换"
        }}
        subtitle="正在准备电商视频商品替换工作台"
        className="h-dvh"
      />
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-5 top-5 z-20 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/20"
      >
        跳过
      </button>
    </div>
  );
}
