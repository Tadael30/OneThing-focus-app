import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ---------- types ---------- */
type Move = { t: string; d: boolean };
type Day = { one: string; moves: Move[]; done: boolean; note: string; mins: number };
type Store = { days: Record<string, Day> };
type Theme = "light" | "dark" | null;

/* ---------- helpers ---------- */
const STORAGE_KEY = "one-thing-v1";
const CIRC = 276.46;
const PRESETS = [25, 50, 90] as const;
const PLACEHOLDERS = ["Start with the smallest step", "Then the next step", "Then the one after"];

const emptyDay = (): Day => ({
  one: "",
  moves: [{ t: "", d: false }, { t: "", d: false }, { t: "", d: false }],
  done: false,
  note: "",
  mins: 0,
});

const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateKey(d);
};

const loadStore = (): Store => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && parsed.days) return parsed;
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return { days: {} };
};

const beep = (): void => {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const a = new Ctx();
    const o = a.createOscillator();
    const g = a.createGain();
    o.connect(g);
    g.connect(a.destination);
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.15, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 1.2);
    o.start();
    o.stop(a.currentTime + 1.2);
  } catch {
    /* audio not available */
  }
};

const fmt = (s: number): string =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* ---------- component ---------- */
export default function OneThing() {
  const today = useMemo(() => dateKey(new Date()), []);
  const [store, setStore] = useState<Store>(loadStore);
  const [theme, setTheme] = useState<Theme>(null);
  const [mins, setMins] = useState<number>(25);
  const [left, setLeft] = useState<number>(25 * 60);
  const [running, setRunning] = useState<boolean>(false);
  const [toast, setToast] = useState<string>("");
  const endRef = useRef<number>(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const oneRef = useRef<HTMLInputElement>(null);

  const day: Day = store.days[today] ?? emptyDay();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }, [store]);

  const update = useCallback(
    (fn: (d: Day) => Day) =>
      setStore((s) => ({ days: { ...s.days, [today]: fn(s.days[today] ?? emptyDay()) } })),
    [today]
  );

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  /* streak: consecutive finished days, counting back from today (or yesterday) */
  const streak = useMemo(() => {
    let n = 0;
    let i = day.done ? 0 : 1;
    while (store.days[daysAgo(i)]?.done) {
      n++;
      i++;
    }
    return n;
  }, [store, day.done]);

  const history = useMemo(
    () =>
      Array.from({ length: 14 }, (_, k) => {
        const i = 13 - k;
        const e = store.days[daysAgo(i)];
        return { key: daysAgo(i), win: !!e?.done, set: !!e?.one, today: i === 0 };
      }),
    [store]
  );
  const wins = history.filter((h) => h.win).length;

  /* timer */
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const remaining = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        setRunning(false);
        setLeft(mins * 60);
        update((d) => ({ ...d, mins: d.mins + mins }));
        showToast(`Block complete. ${mins} min logged`);
        beep();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [running, mins, update, showToast]);

  useEffect(() => {
    document.title = running ? `${fmt(left)} · One Thing` : "One Thing — your daily focus";
  }, [running, left]);

  const total = mins * 60;
  const idle = !running && left === total;

  const toggleTimer = () => {
    if (running) {
      setRunning(false);
      return;
    }
    endRef.current = Date.now() + left * 1000;
    setRunning(true);
  };

  const resetTimer = () => {
    setRunning(false);
    setLeft(total);
  };

  const pickPreset = (m: number) => {
    setRunning(false);
    setMins(m);
    setLeft(m * 60);
  };

  const toggleDone = () => {
    if (!day.one.trim()) {
      showToast("Write your one thing first");
      oneRef.current?.focus();
      return;
    }
    const next = !day.done;
    update((d) => ({ ...d, done: next }));
    showToast(next ? "Done. Keep the streak going" : "Reopened");
  };

  const setMove = (i: number, patch: Partial<Move>) =>
    update((d) => ({ ...d, moves: d.moves.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));

  const toggleTheme = () => {
    const cur: "light" | "dark" =
      theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(cur === "dark" ? "light" : "dark");
  };

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const hint = day.done
    ? "Everything else today is a bonus."
    : day.one
    ? "Finish this before anything else."
    : "Pick the task that matters most.";

  return (
    <div className={`ot${day.done ? " is-done" : ""}`} data-theme={theme ?? undefined}>
      <style>{CSS}</style>
      <main>
        <header>
          <span className="date">{dateLabel}</span>
          <div className="tools">
            <span className="chip streak">
              <b>{streak}</b> day streak
            </span>
            <button className="chip" onClick={toggleTheme} aria-label="Switch light or dark theme">
              Theme
            </button>
          </div>
        </header>

        <h1>What is the one thing that makes today a win?</h1>
        <input
          ref={oneRef}
          className="one"
          type="text"
          maxLength={120}
          autoComplete="off"
          placeholder="Write it in one sentence"
          aria-label="Today’s one thing"
          value={day.one}
          onChange={(e) => update((d) => ({ ...d, one: e.target.value }))}
        />
        <div className="row">
          <button className={`go${day.done ? " ok" : ""}`} onClick={toggleDone}>
            {day.done ? "Done. Nice work" : "Mark it done"}
          </button>
          <span className="hint">{hint}</span>
        </div>

        <section aria-labelledby="t1">
          <div className="timer">
            <div className="ring">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle className="tr" cx="50" cy="50" r="44" />
                <circle
                  className="pg"
                  cx="50"
                  cy="50"
                  r="44"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - left / total)}
                />
              </svg>
              <div className="time" role="timer">
                {fmt(left)}
              </div>
            </div>
            <div>
              <h2 id="t1">Focus block</h2>
              <p className="sub">Work only on your one thing until the timer ends.</p>
              <div className="presets">
                {PRESETS.map((m) => (
                  <button key={m} aria-pressed={mins === m} onClick={() => pickPreset(m)}>
                    {m} min
                  </button>
                ))}
              </div>
              <div className="ctl">
                <button className="start" onClick={toggleTimer}>
                  {running ? "Pause" : idle ? "Start" : "Resume"}
                </button>
                <button onClick={resetTimer}>Reset</button>
              </div>
              <p className="mins">
                {day.mins ? `Focused today: ${day.mins} min` : "No focus time logged yet today."}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="t2">
          <h2 id="t2">First three moves</h2>
          <p className="sub">Small steps you can start in the next ten minutes.</p>
          {day.moves.map((m, i) => (
            <div className="mv" key={i}>
              <input
                type="checkbox"
                checked={m.d}
                aria-label={`Move ${i + 1} done`}
                onChange={(e) => setMove(i, { d: e.target.checked })}
              />
              <input
                type="text"
                value={m.t}
                placeholder={PLACEHOLDERS[i]}
                aria-label={`Move ${i + 1}`}
                onChange={(e) => setMove(i, { t: e.target.value })}
              />
            </div>
          ))}
        </section>

        <section aria-labelledby="t3">
          <h2 id="t3">Tonight’s note</h2>
          <p className="sub">What worked, what got in the way, what changes tomorrow?</p>
          <textarea
            placeholder="Write a few honest lines"
            aria-label="Evening note"
            value={day.note}
            onChange={(e) => update((d) => ({ ...d, note: e.target.value }))}
          />
        </section>

        <section aria-labelledby="t4">
          <h2 id="t4">Last 14 days</h2>
          <p className="sub">{wins} of the last 14 days won. Aim for consistency, not perfection.</p>
          <div className="dots">
            {history.map((h) => (
              <div
                key={h.key}
                title={h.key}
                className={`dot${h.win ? " win" : h.set ? " set" : ""}${h.today ? " today" : ""}`}
              />
            ))}
          </div>
          <div className="legend">
            <span>Filled: one thing done</span>
            <span>Blue ring: set, not done</span>
            <span>Grey ring: no entry</span>
          </div>
        </section>
      </main>
      <div className={`toast${toast ? " on" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const CSS = `
@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Figtree:wght@400;500;600&display=swap");
.ot{--bg:#e8edf3;--card:#f7f9fc;--ink:#14213d;--mute:#5b6b86;--line:#cfd8e5;--blue:#2d4bff;--blue-ink:#fff;--sun:#ffb81c;--ok:#12805c;
--d:"Bricolage Grotesque",Georgia,serif;--b:"Figtree",system-ui,sans-serif;
min-height:100vh;background:var(--bg);color:var(--ink);font:400 17px/1.55 var(--b);-webkit-font-smoothing:antialiased;
padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
@media (prefers-color-scheme:dark){.ot:not([data-theme="light"]){--bg:#0e1526;--card:#16203a;--ink:#eaf0ff;--mute:#9aa9c7;--line:#2a3860;--blue:#6f86ff;--blue-ink:#0e1526;--sun:#ffc84a;--ok:#4cd4a1}}
.ot[data-theme="dark"]{--bg:#0e1526;--card:#16203a;--ink:#eaf0ff;--mute:#9aa9c7;--line:#2a3860;--blue:#6f86ff;--blue-ink:#0e1526;--sun:#ffc84a;--ok:#4cd4a1}
.ot *,.ot *::before,.ot *::after{box-sizing:border-box}
.ot main{max-width:720px;margin:0 auto;padding:28px 20px 80px}
.ot header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:36px}
.ot .date{font:500 15px var(--b);color:var(--mute)}
.ot .tools{display:flex;gap:8px}
.ot button{font:inherit;cursor:pointer;color:inherit}
.ot button:focus-visible,.ot input:focus-visible,.ot textarea:focus-visible{outline:3px solid var(--blue);outline-offset:3px;border-radius:8px}
.ot .chip{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:6px 14px;font-size:14px;font-weight:500}
.ot .streak b{font-family:var(--d);font-size:15px}
.ot h1{font:800 clamp(34px,7vw,56px)/1.04 var(--d);letter-spacing:-.025em;margin:0 0 20px}
.ot .one{width:100%;border:0;border-bottom:3px solid var(--ink);background:transparent;color:var(--ink);font:700 clamp(24px,5vw,36px)/1.2 var(--d);padding:8px 0 12px;letter-spacing:-.01em;border-radius:0}
.ot .one::placeholder{color:var(--mute);opacity:.6}
.ot .one:focus-visible{outline:none;border-color:var(--blue)}
.ot.is-done .one{text-decoration:line-through;text-decoration-thickness:3px;color:var(--mute);border-color:var(--ok)}
.ot .row{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:22px 0 0}
.ot .go{background:var(--blue);color:var(--blue-ink);border:0;border-radius:14px;padding:14px 24px;font:700 17px var(--d);transition:transform .15s}
.ot .go:active{transform:scale(.97)}
.ot .go.ok{background:var(--ok);color:#fff}
.ot .hint{color:var(--mute);font-size:15px}
.ot section{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:26px;margin-top:28px}
.ot h2{font:700 22px var(--d);margin:0 0 4px;letter-spacing:-.01em}
.ot .sub{color:var(--mute);font-size:15px;margin:0 0 18px}
.ot .timer{display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:center}
.ot .ring{position:relative;width:168px;height:168px}
.ot .ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ot .ring circle{fill:none;stroke-width:10}
.ot .ring .tr{stroke:var(--line)}
.ot .ring .pg{stroke:var(--sun);stroke-linecap:round;transition:stroke-dashoffset .4s linear}
.ot .time{position:absolute;inset:0;display:grid;place-items:center;font:800 38px var(--d);font-variant-numeric:tabular-nums}
.ot .presets{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.ot .presets button{border:1.5px solid var(--line);background:transparent;border-radius:10px;padding:6px 14px;font-weight:600;font-size:15px}
.ot .presets button[aria-pressed="true"]{border-color:var(--ink);background:var(--ink);color:var(--bg)}
.ot .ctl{display:flex;gap:10px;flex-wrap:wrap}
.ot .ctl button{border-radius:12px;padding:11px 20px;font-weight:600;border:1.5px solid var(--ink);background:transparent}
.ot .ctl .start{background:var(--ink);color:var(--bg)}
.ot .mins{margin:14px 0 0;color:var(--mute);font-size:15px}
.ot .mv{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
.ot .mv:first-of-type{border-top:0}
.ot .mv input[type=checkbox]{appearance:none;-webkit-appearance:none;width:26px;height:26px;border:2px solid var(--ink);border-radius:8px;flex:none;cursor:pointer;display:grid;place-items:center;margin:0}
.ot .mv input[type=checkbox]:checked{background:var(--ok);border-color:var(--ok)}
.ot .mv input[type=checkbox]:checked::after{content:"";width:6px;height:12px;border:solid #fff;border-width:0 2.5px 2.5px 0;transform:rotate(45deg) translate(-1px,-1px)}
.ot .mv input[type=text]{flex:1;min-width:0;border:0;background:transparent;color:var(--ink);font:500 17px var(--b);padding:6px 0}
.ot .mv input[type=checkbox]:checked+input{text-decoration:line-through;color:var(--mute)}
.ot textarea{width:100%;min-height:96px;resize:vertical;border:1.5px solid var(--line);border-radius:14px;background:var(--bg);color:var(--ink);font:400 17px/1.5 var(--b);padding:14px}
.ot .dots{display:grid;grid-template-columns:repeat(14,1fr);gap:6px;margin-top:6px}
.ot .dot{aspect-ratio:1;border-radius:50%;border:2px solid var(--line)}
.ot .dot.set{border-color:var(--blue)}
.ot .dot.win{background:var(--ok);border-color:var(--ok)}
.ot .dot.today{box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--ink)}
.ot .legend{display:flex;gap:16px;flex-wrap:wrap;color:var(--mute);font-size:14px;margin-top:14px}
.ot .toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);background:var(--ink);color:var(--bg);padding:12px 20px;border-radius:12px;font-weight:600;opacity:0;pointer-events:none;transition:.25s}
.ot .toast.on{opacity:1;transform:translate(-50%,0)}
@media (max-width:560px){.ot .timer{grid-template-columns:1fr;justify-items:center;text-align:center}.ot .presets,.ot .ctl{justify-content:center}.ot section{padding:20px}}
@media (prefers-reduced-motion:reduce){.ot *{transition:none!important}}
`;
