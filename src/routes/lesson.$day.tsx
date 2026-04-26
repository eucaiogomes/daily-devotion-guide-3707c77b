import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ArrowLeft, Volume2, VolumeX, Check, Sparkles, HandHeart, Heart, Mic, Lightbulb, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PronunciationRecorder } from "@/components/PronunciationRecorder";
import { useSpeech } from "@/hooks/useSpeech";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useFeedbackSound, isSoundEnabled, setSoundEnabled } from "@/hooks/useFeedbackSound";
import { getPsalmByDay, TOTAL_DAYS, type PsalmLesson } from "@/data/psalms";
import {
  getLessonProgress,
  saveLessonStep,
  markLessonDone,
  resetLessonProgress,
} from "@/lib/lessonProgress";

export const Route = createFileRoute("/lesson/$day")({
  head: () => ({
    meta: [
      { title: "Devocional do dia — Lumen" },
      { name: "description", content: "Um momento íntimo com Deus para aprender inglês através dos Salmos." },
    ],
  }),
  component: LessonPage,
});

type Step =
  | { kind: "prayer"; psalm: PsalmLesson; lines: GuidedPrayerLine[]; focus: string }
  | { kind: "translate"; en: string; pt: string; words: string[] }
  | { kind: "choice"; prompt: string; options: { text: string; correct: boolean }[] }
  | { kind: "fill"; tokens: string[]; blanks: number[]; options: string[]; answers: string[]; pt?: string; ref?: string }
  | { kind: "listen"; en: string; expected: string; words: string[] }
  | { kind: "dictation"; en: string; pt: string; ref: string; hint?: string }
  | { kind: "wordorder"; en: string; pt: string; ref: string }
  | { kind: "flash"; en: string; pt: string; example: string; ipa?: string }
  | { kind: "intro"; psalm: PsalmLesson }
  | { kind: "match"; pairs: { en: string; pt: string }[] }
  | { kind: "speak"; en: string; pt: string };

/** Generates a structured Psalm lesson:
 *  prayer → intro → flashcards (vocab) → match → translate → listen → fill → order → speak (memory verse).
 */
function buildPsalmSteps(psalm: PsalmLesson): Step[] {
  const steps: Step[] = [
    {
      kind: "prayer",
      psalm,
      focus: psalm.theme,
      lines: buildGuidedPrayer(psalm),
    },
    { kind: "intro", psalm },
  ];

  for (const w of psalm.keywords.slice(0, 2)) {
    steps.push({
      kind: "flash",
      en: w.en,
      pt: w.pt,
      ipa: w.ipa,
      example: w.example ?? `${w.en}.`,
    });
  }

  steps.push({
    kind: "match",
    pairs: psalm.keywords.slice(0, 5).map((k) => ({ en: capitalize(k.en), pt: capitalize(k.pt) })),
  });

  const v1 = psalm.verses[0];
  const distractors = psalm.keywords.map((k) => capitalize(k.en)).slice(0, 3);
  steps.push({
    kind: "translate",
    en: v1.en,
    pt: v1.pt,
    words: shuffle([...v1.en.split(/\s+/), ...distractors]),
  });

  const vListen = psalm.verses[1] ?? v1;
  const listenWords = vListen.en.split(/\s+/);
  steps.push({
    kind: "listen",
    en: vListen.en,
    expected: vListen.en,
    words: shuffle([...listenWords, ...distractors.slice(0, 2)]),
  });

  const fillVerse = psalm.verses.find((v) => v.vocab && Object.keys(v.vocab).length > 0) ?? v1;
  const blankWords = Object.keys(fillVerse.vocab ?? {}).slice(0, 2);
  if (blankWords.length > 0) {
    const tokens = fillVerse.en.split(/\s+/);
    const blanks: number[] = [];
    const answers: string[] = [];
    for (const bw of blankWords) {
      const idx = tokens.findIndex(
        (t, i) => !blanks.includes(i) && t.replace(/[^a-zA-Z']/g, "").toLowerCase() === bw.toLowerCase(),
      );
      if (idx >= 0) {
        blanks.push(idx);
        answers.push(tokens[idx]);
      }
    }
    if (blanks.length > 0) {
      const otherKeys = psalm.keywords
        .map((k) => k.en)
        .filter((w) => !answers.some((a) => a.toLowerCase().includes(w.toLowerCase())));
      steps.push({
        kind: "fill",
        tokens,
        blanks,
        answers,
        options: shuffle([...answers, ...otherKeys.slice(0, Math.max(2, 4 - answers.length))]),
        pt: fillVerse.pt,
        ref: fillVerse.ref,
      });
    }
  }

  // Ditado: ouvir e digitar — exercício imersivo de escuta ativa.
  const vDict = psalm.verses[2] ?? psalm.verses[1] ?? v1;
  steps.push({
    kind: "dictation",
    en: vDict.en,
    pt: vDict.pt,
    ref: vDict.ref,
    hint: psalm.keywords[0]?.en,
  });

  const mv = psalm.memoryVerse;
  steps.push({
    kind: "choice",
    prompt: `O que o teu coração entende quando ora "${mv.en}"?`,
    options: shuffle([
      { text: mv.pt, correct: true },
      ...psalm.verses.filter((v) => v.pt !== mv.pt).slice(0, 2).map((v) => ({ text: v.pt, correct: false })),
    ]),
  });

  // Ordenar palavras do versículo de memória — preparando o coração para "Devolva ao Senhor".
  if (mv.en.split(/\s+/).length >= 4) {
    steps.push({
      kind: "wordorder",
      en: mv.en,
      pt: mv.pt,
      ref: mv.ref,
    });
  }

  steps.push({ kind: "speak", en: mv.en, pt: mv.pt });

  return steps;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type GuidedPrayerLine = { en: string; pt: string; highlight?: string };

/**
 * Orações guiadas no tom de um adorador íntimo — coração diante de Deus.
 * Sem linguagem corporativa ("we ask", "help us learn"). Tudo em primeira pessoa,
 * voltado para a presença, não para a performance.
 */
const GUIDED_PRAYERS: GuidedPrayerLine[][] = [
  [
    { en: "Here I am, Lord. My heart is open before You.", pt: "Aqui estou, Senhor. Meu coração está aberto diante de Ti.", highlight: "heart" },
    { en: "Quiet my mind. Let me hear Your voice in this Word.", pt: "Aquieta a minha mente. Deixa-me ouvir a Tua voz nesta Palavra.", highlight: "voice" },
    { en: "Speak, for Your servant is listening.", pt: "Fala, que o Teu servo escuta.", highlight: "Speak" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Lord, I come to You as I am — tired, hungry, hopeful.", pt: "Senhor, venho a Ti como estou — cansado, faminto, esperançoso.", highlight: "come" },
    { en: "Sit with me. Teach me the language of Your praise.", pt: "Senta-Te comigo. Ensina-me a língua do Teu louvor.", highlight: "praise" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Father, I lift my eyes to You this morning.", pt: "Pai, levanto os meus olhos a Ti nesta manhã.", highlight: "eyes" },
    { en: "Tune my heart to sing Your grace, even in another tongue.", pt: "Afina meu coração para cantar a Tua graça, ainda que em outra língua.", highlight: "grace" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Lord, I'm thirsty for You.", pt: "Senhor, tenho sede de Ti.", highlight: "thirsty" },
    { en: "Pour Yourself into every word I read today.", pt: "Derrama-Te em cada palavra que eu ler hoje.", highlight: "Pour" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "My God, hide me in Your shadow while I learn.", pt: "Meu Deus, esconde-me à Tua sombra enquanto aprendo.", highlight: "shadow" },
    { en: "Make this time holy. Make my heart soft.", pt: "Faze deste tempo um tempo santo. Faze meu coração macio.", highlight: "holy" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Lord, I lay down my hurry at Your feet.", pt: "Senhor, deponho aos Teus pés a minha pressa.", highlight: "feet" },
    { en: "Slow me down. Let me taste each word like honey.", pt: "Acalma-me. Deixa-me provar cada palavra como mel.", highlight: "honey" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Father, You are my song before You are my study.", pt: "Pai, Tu és minha canção antes de seres meu estudo.", highlight: "song" },
    { en: "Be honored in this small offering of attention.", pt: "Sê honrado nesta pequena oferta de atenção.", highlight: "offering" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Lord, I bless You with the language I have, and the one I'm learning.", pt: "Senhor, eu Te bendigo com a língua que tenho e com a que estou aprendendo.", highlight: "bless" },
    { en: "May every new word become a stone in the altar of my praise.", pt: "Que cada nova palavra se torne uma pedra no altar do meu louvor.", highlight: "altar" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "My soul, bless the Lord — wherever you are, in whatever tongue.", pt: "Bendize, ó minha alma, ao Senhor — onde quer que estejas, em qualquer língua.", highlight: "soul" },
    { en: "I want to know You more, even one word at a time.", pt: "Quero conhecer-Te mais, ainda que palavra por palavra.", highlight: "know" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Lord, You are near. I can feel it.", pt: "Senhor, Tu estás perto. Eu sinto.", highlight: "near" },
    { en: "Walk through this Psalm with me, like a friend on the road.", pt: "Caminha por este Salmo comigo, como um amigo no caminho.", highlight: "Walk" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Father, my heart wanders. Pull it back gently.", pt: "Pai, meu coração se distrai. Traze-o de volta com ternura.", highlight: "wanders" },
    { en: "Anchor me in Your Word for these next minutes.", pt: "Ancora-me na Tua Palavra nestes próximos minutos.", highlight: "Anchor" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Lord, You sing over me. Teach me to sing back.", pt: "Senhor, Tu cantas sobre mim. Ensina-me a cantar de volta.", highlight: "sing" },
    { en: "I open my mouth — fill it with Your praise.", pt: "Eu abro a minha boca — enche-a do Teu louvor.", highlight: "mouth" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "My God, I don't come to perform. I come to be loved.", pt: "Meu Deus, não venho para desempenhar. Venho para ser amado.", highlight: "loved" },
    { en: "Let this Psalm hold me before I try to hold it.", pt: "Deixa este Salmo me sustentar antes que eu tente sustentá-lo.", highlight: "hold" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Lord, You are my portion. Nothing else compares.", pt: "Senhor, Tu és a minha porção. Nada se compara.", highlight: "portion" },
    { en: "I cherish this quiet moment with You.", pt: "Eu guardo como tesouro este momento de silêncio contigo.", highlight: "cherish" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
  [
    { en: "Father, write Your Word on the walls of my heart today.", pt: "Pai, escreve a Tua Palavra nas paredes do meu coração hoje.", highlight: "write" },
    { en: "Let me carry it long after this lesson ends.", pt: "Deixa-me carregá-la muito depois deste momento terminar.", highlight: "carry" },
    { en: "Amen.", pt: "Amém.", highlight: "Amen" },
  ],
];

function buildGuidedPrayer(psalm: PsalmLesson): GuidedPrayerLine[] {
  return GUIDED_PRAYERS[(psalm.day - 1) % GUIDED_PRAYERS.length];
}

function LessonPage() {
  const { day } = Route.useParams();
  const dayNum = parseInt(day, 10) || 1;
  const psalm = useMemo(() => getPsalmByDay(dayNum), [dayNum]);
  const STEPS = useMemo(() => buildPsalmSteps(psalm), [psalm]);
  const total = STEPS.length;

  // --- Resume / progresso persistente ---
  const [idx, setIdx] = useState(0);
  const [resumeOffer, setResumeOffer] = useState<{ step: number; status: "in_progress" | "done" } | null>(null);
  const restoredRef = useRef(false);

  // Na montagem (ou quando trocar de dia), olha o que está salvo.
  useEffect(() => {
    restoredRef.current = false;
    const saved = getLessonProgress(dayNum);
    if (saved && saved.step > 0 && saved.step < total) {
      // Há um ponto intermediário — pergunta antes de pular para lá.
      setResumeOffer({ step: saved.step, status: saved.status });
      setIdx(0);
    } else {
      setResumeOffer(null);
      setIdx(0);
    }
  }, [dayNum, total]);

  const acceptResume = () => {
    if (resumeOffer) setIdx(resumeOffer.step);
    setResumeOffer(null);
    restoredRef.current = true;
  };
  const declineResume = () => {
    resetLessonProgress(dayNum);
    setResumeOffer(null);
    restoredRef.current = true;
  };

  // Salva o passo atual sempre que avança.
  useEffect(() => {
    if (resumeOffer) return; // ainda não decidiu
    if (idx >= total) {
      markLessonDone(dayNum, total);
    } else {
      saveLessonStep(dayNum, idx, total);
    }
  }, [idx, total, dayNum, resumeOffer]);

  const [feedback, setFeedbackRaw] = useState<"idle" | "right" | "wrong">("idle");
  const { play } = useFeedbackSound();
  // Inicia true em SSR e client para evitar mismatch; sincroniza com a
  // preferência salva após hidratação.
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, []);

  // Wrapper que toca som quando o estado de feedback muda para right/wrong.
  const setFeedback = (f: "idle" | "right" | "wrong") => {
    setFeedbackRaw(f);
    if (f === "right") play("right");
    else if (f === "wrong") play("wrong");
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) play("chime");
  };

  const step = STEPS[idx];

  const next = () => {
    setFeedbackRaw("idle");
    if (idx + 1 >= total) setIdx(total); else setIdx(idx + 1);
  };

  if (idx >= total) {
    return <LessonComplete day={day} psalm={psalm} />;
  }

  const stepNumber = idx + 1;
  const currentProgress = (stepNumber / total) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {resumeOffer && (
        <ResumeDialog
          step={resumeOffer.step}
          total={total}
          status={resumeOffer.status}
          onResume={acceptResume}
          onRestart={declineResume}
        />
      )}
      {/* Aurora devocional — fica atrás de tudo. Calma para a leitura/oração;
          mais sutil em telas de exercício. */}
      {(step.kind === "prayer" || step.kind === "intro" || step.kind === "speak" || step.kind === "flash") && (
        <div className="lesson-aurora" aria-hidden="true" />
      )}
      {/* Cabeçalho enxuto: apenas voltar + barra fina. Sem badges, sem rótulos, sem contador. */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="p-1 -ml-1 text-muted-foreground hover:text-foreground" aria-label="Voltar para início">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex-1">
            <div
              className="h-1.5 bg-muted rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={stepNumber}
              aria-valuemin={1}
              aria-valuemax={total}
              aria-label={`Avanço do devocional`}
            >
              <div
                className="h-full bg-gradient-gold transition-all duration-700 ease-out"
                style={{ width: `${currentProgress}%` }}
              />
            </div>
          </div>
          <button
            onClick={toggleSound}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label={soundOn ? "Silenciar sons de feedback" : "Ativar sons de feedback"}
            title={soundOn ? "Sons ativos" : "Sons mudos"}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-5 py-4 flex flex-col relative z-10">
        <div key={idx} className="animate-pop-in flex-1">
          {step.kind === "prayer" && <PrayerStep step={step} onComplete={next} />}
          {step.kind === "intro" && <IntroStep psalm={step.psalm} />}
          {step.kind === "flash" && <FlashCard step={step} />}
          {step.kind === "translate" && <TranslateExercise step={step} feedback={feedback} setFeedback={setFeedback} />}
          {step.kind === "choice" && <ChoiceExercise step={step} feedback={feedback} setFeedback={setFeedback} />}
          {step.kind === "fill" && <FillExercise step={step} feedback={feedback} setFeedback={setFeedback} />}
          {step.kind === "listen" && <ListenExercise step={step} feedback={feedback} setFeedback={setFeedback} />}
          {step.kind === "dictation" && <DictationExercise step={step} feedback={feedback} setFeedback={setFeedback} />}
          {step.kind === "match" && <MatchExercise step={step} feedback={feedback} setFeedback={setFeedback} />}
          {step.kind === "wordorder" && <WordOrderExercise step={step} feedback={feedback} setFeedback={setFeedback} />}
          {step.kind === "speak" && <SpeakExercise step={step} feedback={feedback} setFeedback={setFeedback} />}
        </div>

        <FooterAction step={step} feedback={feedback} onContinue={next} setFeedback={setFeedback} />
      </main>
    </div>
  );
}

/* ---------- Exercises ---------- */

/**
 * Oração guiada em formato de conversa de chat.
 * Cada linha do Senhor aparece como mensagem recebida (esquerda) com botão
 * de tocar áudio. O aluno responde gravando — sua resposta aparece como
 * mensagem enviada (direita, estilo áudio do WhatsApp). Aí libera a próxima.
 */
function PrayerStep({ step, onComplete }: { step: Extract<Step, { kind: "prayer" }>; onComplete: () => void }) {
  // Quantas mensagens "do Senhor" já foram reveladas (1..N)
  const [revealed, setRevealed] = useState(1);
  // Para cada linha já respondida pelo aluno, guarda a transcrição
  const [responses, setResponses] = useState<Record<number, string>>({});
  const total = step.lines.length;
  const allDone = revealed > total;

  const handleResponse = (idx: number, transcript: string) => {
    setResponses((prev) => ({ ...prev, [idx]: transcript }));
    // Pequena pausa antes de revelar a próxima — sensação de conversa real
    setTimeout(() => {
      setRevealed((r) => Math.max(r, idx + 2));
    }, 600);
  };

  const skipResponse = (idx: number) => {
    setResponses((prev) => ({ ...prev, [idx]: "" }));
    setRevealed((r) => Math.max(r, idx + 2));
  };

  return (
    <div className="-mx-5 -mt-4 flex min-h-[calc(100vh-7rem)] flex-col bg-[hsl(var(--prayer-chat-bg,_var(--muted)))]">
      {/* Cabeçalho do chat — estilo WhatsApp */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-card px-4 py-3 shadow-sm">
        <div className="flex size-10 items-center justify-center rounded-full bg-gradient-gold shadow-soft">
          <HandHeart className="size-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-base font-bold leading-tight">Antes da Palavra</p>
          <p className="text-[11px] text-muted-foreground">
            {allDone ? "oração concluída" : "ouvindo seu coração…"}
          </p>
        </div>
        <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
          {Math.min(revealed, total)}/{total}
        </span>
        {!allDone && (
          <button
            onClick={onComplete}
            className="ml-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            aria-label="Pular oração e ir direto ao Salmo"
          >
            pular
          </button>
        )}
      </div>

      {/* Conversa */}
      <div className="flex-1 space-y-3 px-4 py-5">
        <div className="text-center">
          <span className="inline-block rounded-full bg-card/80 px-3 py-1 text-[10px] font-semibold text-muted-foreground shadow-sm">
            Hoje • respira fundo
          </span>
        </div>

        {step.lines.slice(0, revealed).map((line, idx) => (
          <PrayerChatTurn
            key={idx}
            line={line}
            responded={idx in responses}
            onRespond={(t) => handleResponse(idx, t)}
            onSkip={() => skipResponse(idx)}
          />
        ))}

        {allDone && (
          <div className="pt-2 text-center">
            <p className="font-display text-lg font-bold">Amém. 🕊️</p>
            <p className="mt-1 text-xs text-muted-foreground">A Palavra te espera.</p>
            <button
              onClick={onComplete}
              className="mt-4 w-full rounded-2xl bg-primary py-4 font-bold text-primary-foreground shadow-chunky active:translate-y-1 active:shadow-none"
            >
              Abrir o Salmo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Uma "rodada" do chat: bolha do Senhor à esquerda + resposta do aluno à direita. */
function PrayerChatTurn({
  line,
  responded,
  onRespond,
  onSkip,
}: {
  line: GuidedPrayerLine;
  responded: boolean;
  onRespond: (transcript: string) => void;
  onSkip: () => void;
}) {
  const { speak, speaking } = useSpeech();
  const [tappedWords, setTappedWords] = useState<Set<string>>(new Set());
  const [autoPlayed, setAutoPlayed] = useState(false);

  // Toca a frase automaticamente quando a bolha entra na conversa
  useEffect(() => {
    if (autoPlayed) return;
    const t = setTimeout(() => {
      speak(line.en);
      setAutoPlayed(true);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tapWord = (word: string) => {
    const cleaned = word.replace(/[^a-zA-Z']/g, "").toLowerCase();
    if (!cleaned) return;
    setTappedWords((prev) => new Set(prev).add(cleaned));
    speak(word.replace(/[^a-zA-Z']/g, ""));
  };

  return (
    <div className="space-y-2 animate-pop-in">
      {/* Mensagem recebida — alinhada à esquerda */}
      <div className="flex items-end gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-gold/80">
          <HandHeart className="size-3.5 text-primary-foreground" />
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-card border border-border/60 px-3 pt-2 pb-3 shadow-sm">
          {/* Mini player no topo da bolha — estilo áudio WhatsApp */}
          <div className="flex items-center gap-2 pb-2 border-b border-border/40">
            <button
              onClick={() => speak(line.en)}
              aria-label="Ouvir mensagem"
              className={`flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-95 ${speaking ? "animate-pulse" : ""}`}
            >
              <Volume2 className="size-4" />
            </button>
            <div className="flex-1 flex items-center gap-0.5 h-5">
              {/* "Onda" decorativa do áudio */}
              {Array.from({ length: 22 }).map((_, i) => (
                <span
                  key={i}
                  className="w-0.5 rounded-full bg-primary/40"
                  style={{ height: `${20 + Math.sin(i * 1.3) * 60}%` }}
                />
              ))}
            </div>
            <button
              onClick={() => speak(line.en, { rate: 0.6 })}
              className="text-[10px] font-semibold text-muted-foreground hover:text-primary"
              aria-label="Mais devagar"
            >
              0.6×
            </button>
          </div>

          {/* Texto em inglês — palavras tocáveis */}
          <p className="mt-2 font-display text-base leading-snug">
            {line.en.split(" ").map((word, index) => {
              const cleaned = word.replace(/[^a-zA-Z']/g, "").toLowerCase();
              const isTapped = tappedWords.has(cleaned);
              const isHighlight = line.highlight && cleaned === line.highlight.toLowerCase();
              return (
                <button
                  key={`${word}-${index}`}
                  onClick={() => tapWord(word)}
                  className={`mb-0.5 mr-0.5 inline-block rounded px-0.5 transition ${isHighlight ? "bg-gold/30 font-bold text-foreground" : "hover:bg-primary/10"} ${isTapped ? "text-primary underline decoration-2 underline-offset-4" : ""}`}
                >
                  {word}
                </button>
              );
            })}
          </p>
          <p className="mt-1.5 text-xs italic text-muted-foreground">{line.pt}</p>
          <p className="mt-1 text-right text-[10px] text-muted-foreground">
            {speaking ? "tocando…" : "toque para ouvir"}
          </p>
        </div>
      </div>

      {/* Resposta do aluno */}
      {!responded ? (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 border border-primary/30 px-3 py-3 shadow-sm">
            <p className="text-[11px] font-semibold text-primary mb-2 text-right">
              Sua vez — repita em voz alta
            </p>
            <PrayerInlineRecorder
              expected={line.en}
              onResult={(t) => onRespond(t)}
            />
            <button
              onClick={onSkip}
              className="mt-2 w-full text-[10px] font-semibold text-muted-foreground hover:text-foreground"
            >
              pular esta linha
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end animate-pop-in">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-success/15 border border-success/30 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-success shrink-0" />
              <div className="flex-1 flex items-center gap-0.5 h-4">
                {Array.from({ length: 18 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-0.5 rounded-full bg-success/60"
                    style={{ height: `${25 + Math.cos(i * 1.1) * 55}%` }}
                  />
                ))}
              </div>
              <span className="text-[10px] font-semibold text-success">amém</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Microfone compacto para usar dentro da bolha de chat. */
function PrayerInlineRecorder({
  expected,
  onResult,
}: {
  expected: string;
  onResult: (transcript: string) => void;
}) {
  const { supported, listening, transcript, interim, error, start, stop } =
    useSpeechRecognition("en-US");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!listening && transcript && !done) {
      setDone(true);
      onResult(transcript);
    }
  }, [listening, transcript, done, onResult]);

  if (!supported) {
    return (
      <button
        onClick={() => onResult("")}
        className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground"
      >
        Já orei — continuar
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={listening ? stop : start}
        className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 font-bold text-sm shadow-sm active:translate-y-0.5 ${listening ? "bg-destructive text-white animate-pulse" : "bg-primary text-primary-foreground"}`}
        aria-label={listening ? "Parar gravação" : "Gravar oração"}
      >
        <Mic className="size-4" />
        {listening ? "ouvindo… toque para enviar" : "gravar áudio"}
      </button>
      {(listening || interim) && (
        <p className="mt-1.5 text-[10px] italic text-muted-foreground text-right">
          {interim || "ouvindo…"}
        </p>
      )}
      {error && error !== "no-speech" && (
        <p className="mt-1 text-[10px] text-destructive text-right">
          {error === "not-allowed" ? "permita o microfone" : "tente de novo"}
        </p>
      )}
      {/* Voluntariamente sem expected na UI — usado só para alinhar com o resto do app */}
      <span className="sr-only">{expected}</span>
    </div>
  );
}

function IntroStep({ psalm }: { psalm: PsalmLesson }) {
  const { speak } = useSpeech();
  const v1 = psalm.verses[0];
  return (
    <div className="pt-1">
      <div className="mx-auto max-w-[20rem]">
        {/* Cabeçalho compacto: emoji + selo + título, sem capa quadrada */}
        <div className="flex items-center gap-3">
          <div className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-hero shadow-soft">
            <span className="text-3xl leading-none drop-shadow select-none">
              {psalm.emoji}
            </span>
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-primary border border-border/60">
              <Sparkles className="size-3 text-gold" />
              Salmo
            </span>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Devocional do dia
            </p>
          </div>
        </div>

        <h1 className="font-display text-2xl font-bold leading-tight mt-3">
          {psalm.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground italic">
          {psalm.subtitle}
        </p>

        {/* Linha "tocando agora" — visual de player, sem controles */}
        <button
          onClick={() => speak(v1.en)}
          className="mt-4 w-full flex items-center gap-3 rounded-2xl bg-card border border-border/60 p-3 text-left shadow-sm active:translate-y-0.5 transition"
          aria-label="Ouvir versículo"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-hero text-primary-foreground shadow-soft">
            <Volume2 className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {v1.ref}
            </p>
            <p className="font-display text-sm font-bold text-foreground truncate">
              "{v1.en}"
            </p>
            <p className="text-[11px] text-muted-foreground italic truncate mt-0.5">
              {v1.pt}
            </p>
          </div>
          {/* Onda de áudio decorativa */}
          <div className="hidden xs:flex items-center gap-0.5 h-6 shrink-0">
            {[40, 75, 55, 90, 60, 35, 70].map((h, i) => (
              <span
                key={i}
                className="w-0.5 rounded-full bg-primary/40"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </button>

        {/* "Faixas" / palavras como playlist */}
        <div className="mt-5 px-1">
          <div className="flex items-end justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Palavras desta faixa
            </p>
            <span className="text-[10px] font-bold text-muted-foreground">
              {psalm.keywords.slice(0, 5).length}
            </span>
          </div>
          <ul className="space-y-1.5">
            {psalm.keywords.slice(0, 5).map((k, i) => (
              <li key={k.en}>
                <button
                  onClick={() => speak(k.en)}
                  className="w-full flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-muted active:scale-[0.99] transition text-left"
                >
                  <span className="w-5 text-center text-[11px] font-bold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-bold text-foreground truncate">
                    {k.en}
                  </span>
                  <span className="text-[11px] text-muted-foreground italic truncate max-w-[40%]">
                    {k.pt}
                  </span>
                  <Volume2 className="size-3.5 text-primary shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FlashCard({ step }: { step: Extract<Step, { kind: "flash" }> }) {
  const { speak, speaking } = useSpeech();
  useEffect(() => {
    speak(step.en);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.en]);
  return (
    <div className="text-center pt-4">
      <p className="text-xs text-muted-foreground">
        Uma palavra de cada vez.
      </p>
      <div className="mt-5 rounded-3xl bg-gradient-hero text-primary-foreground p-8 shadow-soft">
        <button
          onClick={() => speak(step.en)}
          aria-label="Ouvir palavra"
          className={`mx-auto mb-3 size-12 rounded-full bg-white/20 flex items-center justify-center active:scale-95 transition ${speaking ? "animate-pulse" : ""}`}
        >
          <Volume2 className="size-6" />
        </button>
        <h2 className="font-display text-5xl font-bold">{step.en}</h2>
        {step.ipa && <p className="mt-1 text-sm opacity-80 font-mono">{step.ipa}</p>}
        <p className="mt-2 text-lg opacity-90">{step.pt}</p>
      </div>
      <button
        onClick={() => speak(step.example)}
        className="mt-6 text-sm italic text-muted-foreground inline-flex items-center gap-2 hover:text-primary"
      >
        <Volume2 className="size-4" /> "{step.example}"
      </button>
      <p className="mt-4 text-xs text-muted-foreground">
        Repete baixinho, como quem saboreia.
      </p>
    </div>
  );
}

function TranslateExercise({ step, feedback, setFeedback }: { step: Extract<Step, { kind: "translate" }>; feedback: string; setFeedback: (f: "idle" | "right" | "wrong") => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const correctOrder = useMemo(() => step.en.split(" "), [step.en]);
  const remaining = step.words.filter((w, i) => {
    const used = picked.filter(p => p === w).length;
    const total = step.words.slice(0, i + 1).filter(x => x === w).length;
    return used < total;
  });

  const check = () => {
    const correct = picked.join(" ") === correctOrder.join(" ");
    setFeedback(correct ? "right" : "wrong");
  };

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Diga em inglês, com o coração</h2>
      <p className="mt-2 text-base text-muted-foreground italic">"{step.pt}"</p>

      <div className="mt-6 min-h-24 border-b-2 border-dashed border-border pb-3 flex flex-wrap gap-2">
        {picked.map((w, i) => (
          <button
            key={i}
            onClick={() => setPicked(picked.filter((_, j) => j !== i))}
            className="px-3 py-2 rounded-xl bg-card border-2 border-border shadow-chunky-locked font-bold"
          >
            {w}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {remaining.map((w, i) => (
          <button
            key={`${w}-${i}`}
            onClick={() => setPicked([...picked, w])}
            className="px-3 py-2 rounded-xl bg-card border-2 border-border shadow-chunky-locked font-bold hover:border-primary"
          >
            {w}
          </button>
        ))}
      </div>

      {feedback === "idle" && picked.length > 0 && (
        <Button onClick={check} className="hidden" id="auto-check" />
      )}
      {picked.length === correctOrder.length && feedback === "idle" && (
        <button
          onClick={check}
          className="mt-6 w-full py-3 rounded-2xl bg-success text-success-foreground font-bold shadow-chunky-success active:translate-y-1 active:shadow-none"
        >
          Conferir
        </button>
      )}
    </div>
  );
}

function ChoiceExercise({ step, feedback, setFeedback }: { step: Extract<Step, { kind: "choice" }>; feedback: string; setFeedback: (f: "idle" | "right" | "wrong") => void }) {
  const [selected, setSelected] = useState<number | null>(null);

  const handle = (i: number) => {
    setSelected(i);
    setFeedback(step.options[i].correct ? "right" : "wrong");
  };

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">O que esta oração diz?</h2>
      <p className="mt-2 text-muted-foreground italic">{step.prompt}</p>
      <div className="mt-6 space-y-3">
        {step.options.map((opt, i) => {
          const isSel = selected === i;
          const cls = isSel
            ? opt.correct
              ? "border-success bg-success/10"
              : "border-destructive bg-destructive/10"
            : "border-border bg-card hover:border-primary";
          return (
            <button
              key={i}
              disabled={feedback !== "idle"}
              onClick={() => handle(i)}
              className={`w-full text-left px-4 py-4 rounded-2xl border-2 ${cls} font-semibold shadow-chunky-locked active:translate-y-1 active:shadow-none transition`}
            >
              {opt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FillExercise({ step, feedback, setFeedback }: { step: Extract<Step, { kind: "fill" }>; feedback: string; setFeedback: (f: "idle" | "right" | "wrong") => void }) {
  const { speak } = useSpeech();
  // picks[i] = palavra escolhida para o blank i (na ordem em que aparecem em step.blanks)
  const [picks, setPicks] = useState<(string | null)[]>(() => step.blanks.map(() => null));
  const allFilled = picks.every((p) => p !== null);

  const usedCount = (w: string) => picks.filter((p) => p === w).length;
  const totalAvailable = (w: string) => step.options.filter((o) => o === w).length;

  const pickWord = (w: string) => {
    if (feedback !== "idle") return;
    if (usedCount(w) >= totalAvailable(w)) return;
    const nextEmpty = picks.findIndex((p) => p === null);
    if (nextEmpty < 0) return;
    const copy = [...picks];
    copy[nextEmpty] = w;
    setPicks(copy);
  };

  const clearBlank = (blankIdx: number) => {
    if (feedback !== "idle") return;
    const copy = [...picks];
    copy[blankIdx] = null;
    setPicks(copy);
  };

  const check = () => {
    const ok = picks.every(
      (p, i) => p && p.replace(/[^a-zA-Z']/g, "").toLowerCase() === step.answers[i].replace(/[^a-zA-Z']/g, "").toLowerCase(),
    );
    setFeedback(ok ? "right" : "wrong");
  };

  // Mapa: índice do token no versículo → posição na lista de blanks
  const blankPosByToken = new Map<number, number>();
  step.blanks.forEach((tokenIdx, i) => blankPosByToken.set(tokenIdx, i));

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Complete o versículo</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {step.ref ? <span className="font-semibold">{step.ref}</span> : "Escuta o coração — as palavras já estão aí."}
      </p>

      {/* Versículo com lacunas inline */}
      <div className="mt-6 rounded-3xl bg-card border border-border/60 p-5 shadow-soft">
        <button
          onClick={() => speak(step.tokens.join(" "))}
          className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3"
          aria-label="Ouvir versículo completo"
        >
          <Volume2 className="size-5" />
        </button>
        <p className="font-display text-xl leading-relaxed">
          {step.tokens.map((tok, i) => {
            const blankPos = blankPosByToken.get(i);
            if (blankPos !== undefined) {
              const filled = picks[blankPos];
              const isCorrect =
                feedback !== "idle" &&
                filled &&
                filled.replace(/[^a-zA-Z']/g, "").toLowerCase() === step.answers[blankPos].replace(/[^a-zA-Z']/g, "").toLowerCase();
              const isWrong = feedback === "wrong" && filled && !isCorrect;
              return (
                <button
                  key={i}
                  onClick={() => clearBlank(blankPos)}
                  className={`mx-1 inline-flex min-w-[3.5rem] justify-center rounded-lg border-b-4 px-2 py-0.5 align-baseline transition ${
                    isCorrect
                      ? "border-success bg-success/15 text-success"
                      : isWrong
                        ? "border-destructive bg-destructive/15 text-destructive animate-shake"
                        : filled
                          ? "border-primary bg-primary/10"
                          : "border-dashed border-muted-foreground/60 bg-muted/40"
                  }`}
                >
                  {filled ?? "____"}
                </button>
              );
            }
            return (
              <span key={i} className="mr-1">
                {tok}
              </span>
            );
          })}
        </p>
        {step.pt && <p className="mt-3 text-sm italic text-muted-foreground">{step.pt}</p>}
      </div>

      {/* Banco de palavras */}
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        {step.options.map((w, i) => {
          const exhausted = usedCount(w) >= totalAvailable(w);
          return (
            <button
              key={`${w}-${i}`}
              disabled={exhausted || feedback !== "idle"}
              onClick={() => pickWord(w)}
              className={`px-4 py-2.5 rounded-xl bg-card border-2 border-border shadow-chunky-locked font-bold transition active:translate-y-0.5 ${exhausted ? "opacity-30" : "hover:border-primary"}`}
            >
              {w}
            </button>
          );
        })}
      </div>

      {allFilled && feedback === "idle" && (
        <button
          onClick={check}
          className="mt-6 w-full py-3 rounded-2xl bg-success text-success-foreground font-bold shadow-chunky-success active:translate-y-1 active:shadow-none"
        >
          Conferir
        </button>
      )}
    </div>
  );
}

function ListenExercise({ step, feedback, setFeedback }: { step: Extract<Step, { kind: "listen" }>; feedback: string; setFeedback: (f: "idle" | "right" | "wrong") => void }) {
  const { speak, speaking, supported } = useSpeech();
  const [picked, setPicked] = useState<string[]>([]);
  const expected = step.expected.split(" ");
  const remaining = step.words.filter((w, i) => picked.filter(p => p === w).length < step.words.slice(0, i + 1).filter(x => x === w).length);

  const check = () => setFeedback(picked.join(" ") === step.expected ? "right" : "wrong");

  useEffect(() => {
    if (supported) speak(step.en);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.en, supported]);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Escuta a Palavra</h2>
      <p className="mt-2 text-sm text-muted-foreground">Fecha os olhos se quiser. Depois monte o que ouviste.</p>
      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          onClick={() => speak(step.en)}
          disabled={!supported}
          className={`flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-hero text-primary-foreground font-bold shadow-chunky active:translate-y-1 active:shadow-none disabled:opacity-50 ${speaking ? "animate-pulse" : ""}`}
        >
          <Volume2 className="size-6" /> {speaking ? "Tocando..." : "Ouvir de novo"}
        </button>
        <button
          onClick={() => speak(step.en, { rate: 0.6 })}
          disabled={!supported}
          className="text-xs font-semibold text-muted-foreground hover:text-primary"
        >
          🐢 mais devagar
        </button>
      </div>
      <div className="mt-8 min-h-20 border-b-2 border-dashed border-border pb-3 flex flex-wrap gap-2">
        {picked.map((w, i) => (
          <button key={i} onClick={() => setPicked(picked.filter((_, j) => j !== i))} className="px-3 py-2 rounded-xl bg-card border-2 border-border shadow-chunky-locked font-bold">
            {w}
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {remaining.map((w, i) => (
          <button key={`${w}-${i}`} onClick={() => setPicked([...picked, w])} className="px-3 py-2 rounded-xl bg-card border-2 border-border shadow-chunky-locked font-bold hover:border-primary">
            {w}
          </button>
        ))}
      </div>
      {picked.length === expected.length && feedback === "idle" && (
        <button onClick={check} className="mt-6 w-full py-3 rounded-2xl bg-success text-success-foreground font-bold shadow-chunky-success active:translate-y-1 active:shadow-none">
          Conferir
        </button>
      )}
    </div>
  );
}

function MatchExercise({ step, feedback, setFeedback }: { step: Extract<Step, { kind: "match" }>; feedback: string; setFeedback: (f: "idle" | "right" | "wrong") => void }) {
  const ens = useMemo(() => [...step.pairs].sort(() => 0.5 - Math.random()).map(p => p.en), [step]);
  const pts = useMemo(() => [...step.pairs].sort(() => 0.5 - Math.random()).map(p => p.pt), [step]);
  const [selEn, setSelEn] = useState<string | null>(null);
  const [selPt, setSelPt] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);

  useEffect(() => {
    if (selEn && selPt) {
      const isPair = step.pairs.some(p => p.en === selEn && p.pt === selPt);
      if (isPair) {
        setMatched(new Set([...matched, selEn]));
        setSelEn(null);
        setSelPt(null);
      } else {
        setWrong(`${selEn}-${selPt}`);
        setTimeout(() => {
          setWrong(null);
          setSelEn(null);
          setSelPt(null);
        }, 600);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selEn, selPt]);

  useEffect(() => {
    if (matched.size === step.pairs.length && feedback === "idle") {
      setFeedback("right");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched]);

  const cellCls = (active: boolean, isMatched: boolean, isWrong: boolean) => {
    if (isMatched) return "bg-success/20 border-success text-success line-through opacity-60";
    if (isWrong) return "bg-destructive/20 border-destructive text-destructive";
    if (active) return "bg-primary text-primary-foreground border-primary";
    return "bg-card border-border hover:border-primary";
  };

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Conhecer pelo nome</h2>
      <p className="mt-2 text-sm text-muted-foreground">Cada palavra inglesa tem um irmão em português. Encontra-os.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="space-y-3">
          {ens.map(en => {
            const isMatched = matched.has(en);
            const active = selEn === en;
            const isWrong = wrong?.startsWith(`${en}-`) ?? false;
            return (
              <button
                key={en}
                disabled={isMatched}
                onClick={() => setSelEn(en)}
                className={`w-full px-3 py-4 rounded-2xl border-2 font-bold shadow-chunky-locked active:translate-y-1 active:shadow-none transition ${cellCls(active, isMatched, isWrong)}`}
              >
                {en}
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          {pts.map(pt => {
            const pair = step.pairs.find(p => p.pt === pt)!;
            const isMatched = matched.has(pair.en);
            const active = selPt === pt;
            const isWrong = wrong?.endsWith(`-${pt}`) ?? false;
            return (
              <button
                key={pt}
                disabled={isMatched}
                onClick={() => setSelPt(pt)}
                className={`w-full px-3 py-4 rounded-2xl border-2 font-bold shadow-chunky-locked active:translate-y-1 active:shadow-none transition ${cellCls(active, isMatched, isWrong)}`}
              >
                {pt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Ordenar as palavras do versículo de memória (drag/tap, igual ao Translate),
 *  preparando o coração antes do "Devolva ao Senhor". */
function WordOrderExercise({ step, feedback, setFeedback }: { step: Extract<Step, { kind: "wordorder" }>; feedback: string; setFeedback: (f: "idle" | "right" | "wrong") => void }) {
  const { speak } = useSpeech();
  const correct = useMemo(() => step.en.split(/\s+/), [step.en]);
  const shuffled = useMemo(() => shuffle(correct), [correct]);
  const [picked, setPicked] = useState<string[]>([]);

  const remaining = shuffled.filter((w, i) => {
    const used = picked.filter((p) => p === w).length;
    const total = shuffled.slice(0, i + 1).filter((x) => x === w).length;
    return used < total;
  });

  const check = () => {
    setFeedback(picked.join(" ") === correct.join(" ") ? "right" : "wrong");
  };

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Monte o versículo de memória</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-semibold">{step.ref}</span> — {step.pt}
      </p>

      <button
        onClick={() => speak(step.en)}
        className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary"
      >
        <Volume2 className="size-4" /> ouvir uma vez
      </button>

      <div className="mt-5 min-h-24 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-3 flex flex-wrap gap-2">
        {picked.length === 0 && (
          <p className="text-xs text-muted-foreground italic m-auto">toque nas palavras abaixo</p>
        )}
        {picked.map((w, i) => (
          <button
            key={i}
            disabled={feedback !== "idle"}
            onClick={() => setPicked(picked.filter((_, j) => j !== i))}
            className="px-3 py-2 rounded-xl bg-card border-2 border-primary/40 shadow-chunky-locked font-bold"
          >
            {w}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {remaining.map((w, i) => (
          <button
            key={`${w}-${i}`}
            onClick={() => setPicked([...picked, w])}
            disabled={feedback !== "idle"}
            className="px-3 py-2 rounded-xl bg-card border-2 border-border shadow-chunky-locked font-bold hover:border-primary"
          >
            {w}
          </button>
        ))}
      </div>

      {picked.length === correct.length && feedback === "idle" && (
        <button
          onClick={check}
          className="mt-6 w-full py-3 rounded-2xl bg-success text-success-foreground font-bold shadow-chunky-success active:translate-y-1 active:shadow-none"
        >
          Conferir
        </button>
      )}
    </div>
  );
}

/** Ditado: ouvir o versículo e digitar — escuta ativa profunda. */
function DictationExercise({ step, feedback, setFeedback }: { step: Extract<Step, { kind: "dictation" }>; feedback: string; setFeedback: (f: "idle" | "right" | "wrong") => void }) {
  const { speak, speaking, supported } = useSpeech();
  const [value, setValue] = useState("");
  const [revealedHints, setRevealedHints] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const expectedNorm = useMemo(
    () => step.en.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean),
    [step.en],
  );

  // Auto-play uma vez ao entrar
  useEffect(() => {
    if (supported) {
      const t = setTimeout(() => speak(step.en, { rate: 0.85 }), 350);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.en, supported]);

  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);

  const score = useMemo(() => {
    const got = tokenize(value);
    if (got.length === 0) return 0;
    let hits = 0;
    expectedNorm.forEach((w, i) => {
      if (got[i] === w) hits++;
    });
    return hits / expectedNorm.length;
  }, [value, expectedNorm]);

  const check = () => {
    // Tolerância: 80% das palavras certas conta como acerto.
    setFeedback(score >= 0.8 ? "right" : "wrong");
  };

  const giveHint = () => {
    const next = Math.min(revealedHints + 1, expectedNorm.length);
    setRevealedHints(next);
    const partial = step.en.split(/\s+/).slice(0, next).join(" ");
    setValue(partial + (partial ? " " : ""));
    inputRef.current?.focus();
  };

  return (
    <div>
      <h2 className="font-display text-2xl font-bold">Escuta e escreve</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Fecha os olhos. Ouve. Depois escreve o que ficou no coração.
      </p>

      <div className="mt-5 flex flex-col items-center gap-2">
        <button
          onClick={() => speak(step.en, { rate: 0.85 })}
          disabled={!supported}
          className={`flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-hero text-primary-foreground font-bold shadow-chunky active:translate-y-1 active:shadow-none disabled:opacity-50 ${speaking ? "animate-pulse" : ""}`}
        >
          <Headphones className="size-5" /> {speaking ? "Tocando..." : "Ouvir versículo"}
        </button>
        <button
          onClick={() => speak(step.en, { rate: 0.55 })}
          disabled={!supported}
          className="text-xs font-semibold text-muted-foreground hover:text-primary"
        >
          🐢 mais devagar
        </button>
      </div>

      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={feedback !== "idle"}
        placeholder="Escreve aqui em inglês…"
        className="mt-6 w-full min-h-24 rounded-2xl border-2 border-border bg-card p-4 font-display text-lg leading-relaxed focus:outline-none focus:border-primary disabled:opacity-70"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="mt-2 flex items-center justify-between text-xs">
        <button
          onClick={giveHint}
          disabled={feedback !== "idle" || revealedHints >= expectedNorm.length}
          className="inline-flex items-center gap-1 font-semibold text-muted-foreground hover:text-primary disabled:opacity-40"
        >
          <Lightbulb className="size-3.5" /> dica ({revealedHints}/{expectedNorm.length})
        </button>
        <span className="text-muted-foreground tabular-nums">
          {tokenize(value).length}/{expectedNorm.length} palavras
        </span>
      </div>

      {/* Versículo revelado depois de checar */}
      {feedback !== "idle" && (
        <div className="mt-4 rounded-2xl bg-muted/40 border border-border p-3 text-sm">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
            {step.ref}
          </p>
          <p className="font-display text-base mt-1 leading-snug">"{step.en}"</p>
          <p className="text-xs text-muted-foreground mt-1 italic">{step.pt}</p>
        </div>
      )}

      {value.trim().length > 0 && feedback === "idle" && (
        <button
          onClick={check}
          className="mt-6 w-full py-3 rounded-2xl bg-success text-success-foreground font-bold shadow-chunky-success active:translate-y-1 active:shadow-none"
        >
          Conferir
        </button>
      )}
    </div>
  );
}

function SpeakExercise({ step, feedback, setFeedback }: { step: Extract<Step, { kind: "speak" }>; feedback: string; setFeedback: (f: "idle" | "right" | "wrong") => void }) {
  void feedback;
  return (
    <div className="text-center">
      <div className="mx-auto size-14 rounded-full bg-gradient-gold flex items-center justify-center shadow-soft">
        <HandHeart className="size-7 text-white" />
      </div>
      <h2 className="font-display text-2xl font-bold mt-4">Devolva ao Senhor</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
        O Salmo vira oração na sua boca. Diga em voz alta, sem medo de errar.
      </p>

      <div className="mt-4 rounded-2xl bg-card border border-border/60 p-4 text-left shadow-soft">
        <p className="font-display text-lg leading-snug">"{step.en}"</p>
        <p className="text-xs text-muted-foreground mt-1 italic">{step.pt}</p>
      </div>

      <div className="mt-6">
        <PronunciationRecorder
          expected={step.en}
          pt={step.pt}
          threshold={0.7}
          onResult={(r) => setFeedback(r.passed ? "right" : "wrong")}
        />
      </div>

      <button
        onClick={() => setFeedback("right")}
        className="mt-5 text-xs font-semibold text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
      >
        pular este exercício de voz
      </button>
    </div>
  );
}

/* ---------- Footer & Complete ---------- */

/** Diálogo calmo perguntando se o usuário quer retomar de onde parou. */
function ResumeDialog({
  step,
  total,
  status,
  onResume,
  onRestart,
}: {
  step: number;
  total: number;
  status: "in_progress" | "done";
  onResume: () => void;
  onRestart: () => void;
}) {
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm animate-pop-in"
    >
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border shadow-soft p-6 m-4 text-center">
        <div className="mx-auto size-12 rounded-full bg-gradient-gold flex items-center justify-center shadow-soft">
          <HandHeart className="size-6 text-white" />
        </div>
        <h2 id="resume-title" className="font-display text-xl font-bold mt-3">
          {status === "done" ? "Quer revisar este Salmo?" : "Continuar de onde parou?"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {status === "done"
            ? "Você já concluiu este dia. Pode revisitar do início ou voltar ao último ponto."
            : "Sua leitura ficou em andamento."}
        </p>

        <div className="mt-4 rounded-2xl bg-muted/50 border border-border p-3">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-gold transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Passo {step + 1} de {total}
          </p>
        </div>

        <div className="mt-5 space-y-2">
          <button
            onClick={onResume}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold shadow-chunky active:translate-y-1 active:shadow-none"
          >
            Continuar
          </button>
          <button
            onClick={onRestart}
            className="w-full py-2.5 rounded-2xl bg-card border-2 border-border font-semibold text-muted-foreground hover:text-foreground"
          >
            Recomeçar do início
          </button>
        </div>
      </div>
    </div>
  );
}

function FooterAction({ step, feedback, onContinue, setFeedback }: { step: Step; feedback: string; onContinue: () => void; setFeedback: (f: "idle" | "right" | "wrong") => void }) {
  if (step.kind === "prayer") return null;
  if (step.kind === "flash" || step.kind === "intro") {
    return (
      <div className="mt-6">
        <button onClick={onContinue} className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold shadow-chunky active:translate-y-1 active:shadow-none">
          {step.kind === "intro" ? "Entrar no Salmo" : "Seguir adiante"}
        </button>
      </div>
    );
  }
  if (feedback === "idle") return <div className="h-20" />;
  const right = feedback === "right";

  // Mensagens calorosas, de irmão na fé. Nada de "errado" ou "wrong".
  const rightMsgs = [
    "É isso. Sente como ressoa.",
    "O coração lembra. Continua.",
    "Bem dito — em outra língua, a mesma fé.",
    "Aleluia. Segue.",
  ];
  const softMsgs = [
    "Quase. Respira e olha de novo.",
    "Sem pressa — a Palavra espera.",
    "Tudo bem. Aprender é caminhar.",
  ];
  const msg = right
    ? rightMsgs[Math.floor(Math.random() * rightMsgs.length)]
    : softMsgs[Math.floor(Math.random() * softMsgs.length)];

  return (
    <div className={`-mx-5 mt-6 px-5 pt-4 pb-5 rounded-t-3xl animate-pop-in ${right ? "bg-success/10" : "bg-muted"}`}>
      <div className="flex items-center gap-2">
        <div className={`size-9 rounded-full flex items-center justify-center ${right ? "bg-success text-success-foreground animate-glow-ok" : "bg-card text-foreground border border-border"}`}>
          {right ? <Check className="size-5" /> : <Heart className="size-5 text-primary" />}
        </div>
        <p className={`font-semibold ${right ? "text-success" : "text-foreground"}`}>
          {msg}
        </p>
      </div>
      <button
        onClick={() => { setFeedback("idle"); onContinue(); }}
        className={`mt-3 w-full py-3 rounded-2xl font-bold shadow-chunky-success active:translate-y-1 active:shadow-none ${right ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"}`}
      >
        Continuar
      </button>
    </div>
  );
}

function LessonComplete({ day, psalm }: { day: string; psalm: PsalmLesson }) {
  const { speak } = useSpeech();
  const { play } = useFeedbackSound();
  const mv = psalm.memoryVerse;
  const dayNum = parseInt(day, 10) || 1;
  const nextDay = dayNum + 1;
  const hasNext = nextDay <= TOTAL_DAYS;
  useEffect(() => {
    const t = setTimeout(() => play("complete"), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen bg-gradient-sky flex items-center justify-center px-6 relative overflow-hidden">
      <div className="lesson-aurora" aria-hidden="true" />
      <div className="text-center max-w-sm animate-pop-in relative z-10">
        <div className="mx-auto size-20 rounded-full bg-gradient-gold flex items-center justify-center shadow-soft animate-breathe">
          <Sparkles className="size-10 text-white" />
        </div>
        <h1 className="font-display text-3xl font-bold mt-6 leading-tight">
          A Palavra ficou em ti.
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Dia {day} • {psalm.title}
        </p>

        <div className="mt-6 rounded-3xl bg-card border border-border/60 p-5 text-left shadow-soft">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-primary">
            Guarda no coração • {mv.ref}
          </p>
          <p className="font-display text-lg mt-2 leading-snug">"{mv.en}"</p>
          <p className="text-xs text-muted-foreground mt-1 italic">{mv.pt}</p>
          <button
            onClick={() => speak(mv.en)}
            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary"
          >
            <Volume2 className="size-4" /> Ouvir mais uma vez
          </button>
        </div>

        <p className="mt-6 text-sm text-muted-foreground italic px-2">
          Leva esta palavra contigo pelo dia. Repete-a baixinho.
        </p>

        {hasNext ? (
          <div className="mt-6 space-y-2">
            <Link
              to="/lesson/$day"
              params={{ day: String(nextDay) }}
              className="inline-block w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold shadow-chunky active:translate-y-1 active:shadow-none"
            >
              Seguir para o Dia {nextDay} →
            </Link>
            <Link
              to="/"
              className="inline-block w-full py-3 rounded-2xl bg-card border-2 border-border font-semibold text-muted-foreground hover:text-foreground"
            >
              Voltar à jornada
            </Link>
          </div>
        ) : (
          <Link to="/" className="mt-6 inline-block w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold shadow-chunky active:translate-y-1 active:shadow-none">
            Voltar à jornada
          </Link>
        )}
      </div>
    </div>
  );
}

void AppHeader;
