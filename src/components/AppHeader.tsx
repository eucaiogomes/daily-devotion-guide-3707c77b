import { Flame, Crown, Heart } from "lucide-react";
import doveMascot from "@/assets/dove-mascot.png";

interface AppHeaderProps {
  streak: number;
  gold: number;
  hearts: number;
}

export function AppHeader({ streak, gold, hearts }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-background/70 backdrop-blur-xl">
      <div className="max-w-md mx-auto px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-2xl bg-gradient-hero shadow-soft flex items-center justify-center overflow-hidden">
            <img src={doveMascot} alt="" aria-hidden="true" className="size-7 object-contain" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-lg font-bold text-foreground">Lumen</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground -mt-0.5">EN · Salmos</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Stat icon={<Flame className="size-3.5" />} value={streak} tone="streak" />
          <Stat icon={<Crown className="size-3.5" />} value={gold} tone="gold" />
          <Stat icon={<Heart className="size-3.5 fill-current" />} value={hearts} tone="accent" />
        </div>
      </div>
    </header>
  );
}

function Stat({
  icon,
  value,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  tone: "streak" | "gold" | "accent";
}) {
  const toneClass =
    tone === "streak"
      ? "text-streak"
      : tone === "gold"
        ? "text-gold"
        : "text-accent";
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full bg-card/80 backdrop-blur px-2.5 py-1 text-xs font-extrabold border border-border/60 ${toneClass}`}
    >
      {icon}
      <span>{value}</span>
    </div>
  );
}
