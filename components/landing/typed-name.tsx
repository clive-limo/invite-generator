"use client";

import { useEffect, useState } from "react";

const NAMES = ["Amara", "Dr. Kamau", "the Otienos", "Table 7", "every guest"];

/**
 * Types guest names one after another, ending each with a blinking mono cursor.
 * Screen readers and reduced-motion users get the static last name.
 */
export function TypedName() {
  const [text, setText] = useState(NAMES[NAMES.length - 1]!);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Start from the name already on screen and delete it first.
    let name = NAMES.length - 1;
    let length = NAMES[name]!.length;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const target = NAMES[name]!;
      if (!deleting && length < target.length) length += 1;
      else if (!deleting) deleting = true;
      else if (length > 0) length -= 1;
      else {
        deleting = false;
        name = (name + 1) % NAMES.length;
      }
      setText(target.slice(0, length));
      const pause = !deleting && length === target.length ? 1600 : deleting ? 45 : 85;
      timer = setTimeout(tick, pause);
    };
    timer = setTimeout(tick, 1600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className="whitespace-nowrap">
      <span aria-hidden className="text-brand-ink">
        {text}
      </span>
      <span className="sr-only">every guest</span>
      <span aria-hidden className="ml-0.5 inline-block animate-pulse font-mono font-normal text-brand">
        _
      </span>
    </span>
  );
}
