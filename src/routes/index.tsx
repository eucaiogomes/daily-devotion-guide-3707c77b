import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { getPsalmByDay, TOTAL_DAYS } from "@/data/psalms";
import { isMissionCompletedToday, syncOfflineMissions } from "@/lib/offlineMission";
import { getLessonProgress, findCurrentDay, type LessonProgressEntry } from "@/lib/lessonProgress";
import {
  CheckCircle2,
  Play,
  RotateCcw,
  BookOpen,
  Music,
  HandHeart,
  Mic,
  ChevronRight,
  Sun,
} from "lucide-react";
import heroPrayer from "@/assets/hero-prayer.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — Devocional do dia" },
      {
        name: "description",
        content:
          "Aprenda inglês todos os dias com os Salmos. Um devocional guiado por dia, simples e direto.",
      },
      { property: "og:title", content: "Lumen — Inglês com os Salmos" },
      { property: "og:description", content: "Devocional diário guiado para aprender inglês com os Salmos." },
    ],
  }),
  component: Index,
});

const CATEGORIES = [
  { id: "verso", label: "Versículo", icon: BookOpen },
  { id: "louvor", label: "Louvor", icon: Music },
  { id: "oracao", label: "Oração", icon: HandHeart },
  { id: "fala", label: "Fala", icon: Mic },
] as const;

function Index() {
  const [currentDay, setCurrentDay] = useState(1);
  const today = getPsalmByDay(currentDay);
  const v1 = today.verses[0];
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState<LessonProgressEntry | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("verso");
  const yearProgress = Math.round((currentDay / TOTAL_DAYS) * 100);

  useEffect(() => {
    const day = findCurrentDay(1, TOTAL_DAYS);
    setCurrentDay(day);
    setDone(isMissionCompletedToday(day));
    setProgress(getLessonProgress(day));
    syncOfflineMissions().catch(() => undefined);
  }, []);

  const isInProgress =
    !!progress && progress.status === "in_progress" && progress.step > 0 && progress.step < progress.totalSteps;
  const isDoneSaved = done || progress?.status === "done";
  const stepLabel = progress
    ? `Passo ${Math.min(progress.step + 1, progress.totalSteps)} de ${progress.totalSteps}`
    : null;
  const pct = progress
    ? Math.round(((progress.step + 1) / progress.totalSteps) * 100)
    : 0;

  // Próximas missões da trilha (preview da lista)
  const upcoming = [1, 2, 3].map((offset) => {
    const d = Math.min(currentDay + offset, TOTAL_DAYS);
    return getPsalmByDay(d);
  });

  return (
    <div className="min-h-screen bg-gradient-sky pb-32">
      <AppHeader streak={3} gold={42} hearts={5} />

      <main className="mx-auto flex max-w-md flex-col px-5 pt-2">
        {/* Saudação */}
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Sun className="inline size-3.5 -mt-0.5 mr-1 text-gold" />
            Bom dia
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight mt-1">
            Bem-vindo,
            <br />
            <span className="text-primary">tempo de luz.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dia <span className="font-bold text-foreground">{currentDay}</span> de {TOTAL_DAYS} ·{" "}
            <span className="font-bold text-primary">{yearProgress}%</span> da jornada
          </p>
        </section>

        {/* Chips de categoria */}
        <section className="mt-6">
          <div className="flex items-center gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className="flex flex-col items-center gap-1.5 shrink-0"
                  aria-pressed={active}
                >
                  <span
                    className={`flex size-14 items-center justify-center rounded-full border transition ${
                      active
                        ? "bg-gradient-hero text-primary-foreground border-transparent shadow-soft"
                        : "bg-card text-primary border-border"
                    }`}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Hero card — devocional do dia */}
        <section className="relative mt-6 overflow-hidden rounded-[2rem] bg-gradient-hero p-6 text-primary-foreground shadow-soft">
          <div className="absolute -right-10 -bottom-8 opacity-50 mix-blend-soft-light pointer-events-none animate-float-slow">
            <img
              src={heroPrayer}
              alt=""
              aria-hidden="true"
              width={1024}
              height={1024}
              className="size-64"
            />
          </div>

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 backdrop-blur px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest">
              <BookOpen className="size-3" />
              {today.title}
            </span>

            <p className="mt-4 font-display text-2xl leading-snug max-w-[18rem]">
              "{v1.en}"
            </p>
            <p className="mt-2 text-xs italic opacity-80 leading-snug max-w-[16rem]">
              {v1.pt}
            </p>
            <p className="mt-2 text-[11px] font-bold opacity-90">— {v1.ref}</p>

            <Link
              to="/lesson/$day"
              params={{ day: String(currentDay) }}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-foreground px-5 py-3 font-display text-sm font-bold text-primary shadow-soft active:translate-y-0.5 transition"
            >
              {isDoneSaved ? (
                <>
                  <CheckCircle2 className="size-4" />
                  Revisar devocional
                </>
              ) : isInProgress ? (
                <>
                  <RotateCcw className="size-4" />
                  Continuar
                </>
              ) : (
                <>
                  <Play className="size-4 fill-current" />
                  Começar agora
                </>
              )}
              <ChevronRight className="size-4 -mr-1" />
            </Link>

            {isInProgress && !isDoneSaved && (
              <div className="mt-5 max-w-[16rem]">
                <div className="h-1.5 rounded-full overflow-hidden bg-primary-foreground/25">
                  <div
                    className="h-full bg-primary-foreground transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wider opacity-90">
                  {stepLabel}
                </p>
              </div>
            )}
            {!isInProgress && (
              <p className="mt-4 text-[10px] font-bold uppercase tracking-wider opacity-75">
                ≈ 5 min · guiado passo a passo
              </p>
            )}
          </div>
        </section>

        {/* Lista — próximos dias */}
        <section className="mt-7">
          <div className="flex items-end justify-between mb-3 px-1">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Sua trilha
              </p>
              <h2 className="font-display text-xl font-bold">Próximos dias</h2>
            </div>
            <Link
              to="/treinos"
              className="text-xs font-bold text-primary"
            >
              Ver tudo
            </Link>
          </div>

          <ul className="space-y-3">
            {upcoming.map((p, i) => {
              const day = currentDay + i + 1;
              return (
                <li key={day}>
                  <Link
                    to="/lesson/$day"
                    params={{ day: String(day) }}
                    className="flex items-center gap-4 rounded-3xl bg-card p-4 border border-border/60 shadow-sm active:translate-y-0.5 transition"
                  >
                    <div className="size-14 shrink-0 rounded-2xl bg-gradient-card border border-border/60 flex flex-col items-center justify-center">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground -mb-0.5">
                        Dia
                      </span>
                      <span className="font-display text-lg font-bold text-primary leading-none">
                        {day}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {p.title}
                      </p>
                      <p className="font-display text-sm font-bold text-foreground truncate mt-0.5">
                        "{p.verses[0].en}"
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {p.verses[0].ref} · ≈ 5 min
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="mt-8 text-center text-[11px] italic text-muted-foreground px-6">
          "Lâmpada para os meus pés é a tua palavra, e luz para o meu caminho." — Salmo 119:105
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
