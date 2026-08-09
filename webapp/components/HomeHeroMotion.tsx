"use client";

import { useEffect, useRef } from "react";

import { startHomeHeroMotionAnimation } from "@/lib/homeHeroMotionAnimation";

export default function HomeHeroMotion() {
  const objectRef = useRef<HTMLObjectElement>(null);

  useEffect(() => {
    const object = objectRef.current;

    if (!object) {
      return;
    }

    return startHomeHeroMotionAnimation(object);
  }, []);

  return (
    <div className="relative aspect-[1380/940] w-full max-w-[540px] overflow-visible">
      <object
        ref={objectRef}
        data="/hero.svg"
        type="image/svg+xml"
        className="absolute inset-0 block h-full w-full"
        aria-label="hero"
      />
    </div>
  );
}
