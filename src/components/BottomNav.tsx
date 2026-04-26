import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Dumbbell, Settings } from "lucide-react";

const ITEMS = [
  { to: "/", label: "Hoje", icon: Home },
  { to: "/treinos", label: "Treinos", icon: Dumbbell },
  { to: "/configuracoes", label: "Ajustes", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
    >
      <ul className="mx-auto flex max-w-md items-center justify-around gap-1 rounded-full bg-card/95 backdrop-blur-xl px-2 py-2 shadow-soft border border-border/60">
        {ITEMS.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={`flex items-center justify-center gap-1.5 rounded-full py-2.5 text-[11px] font-extrabold uppercase tracking-wider transition ${
                  active
                    ? "bg-gradient-hero text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`size-4 ${active ? "stroke-[2.5]" : ""}`} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
