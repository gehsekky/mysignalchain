import {
  Cable,
  Cpu,
  Guitar,
  Mic,
  PlugZap,
  SlidersHorizontal,
  Speaker,
  SquareStack,
  ToggleLeft,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Generic illustrations by top-level category, shown until a gear page has
 * photos (M2). Lucide icons, ISC licensed.
 */
const ICONS: Record<string, LucideIcon> = {
  instrument: Guitar,
  pedal: Zap,
  "multi-effects": Cpu,
  amp: SquareStack,
  cab: Speaker,
  utility: ToggleLeft,
  controller: SlidersHorizontal,
  power: PlugZap,
  recording: Mic,
};

export function CategoryIcon({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const Icon = ICONS[slug] ?? Cable;
  return <Icon aria-hidden className={className} strokeWidth={1.25} />;
}
