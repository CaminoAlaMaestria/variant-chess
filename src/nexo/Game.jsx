import "./style.css";
import { engineMove, engineEvaluate } from "./engine/client.js";
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Swords,
  Activity,
  Palette,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  ArrowLeftRight,
  RotateCcw,
  Download,
  Flag,
  Settings2,
  Volume2,
  VolumeX,
  X,
  Check,
  Zap,
  Cpu,
  Users,
  Sparkles,
  Plus,
  CircleHelp,
  MoveUpRight,
  Maximize2,
  Minimize2,
  Lightbulb,
  Play,
  Pause,
  ShieldCheck,
  Target,
  Layers3,
  Menu,
  MoreHorizontal,
  Circle,
  Copy,
  Loader2,
  Dices,
  Trash2,
  RefreshCcw,
  PackageOpen,
} from "lucide-react";
import {
  initial,
  legalMoves,
  applyMove,
  boardFromFen,
  square,
  index,
  budget,
  other,
  uci,
  inCheck,
  pgn,
  material,
  rollDice,
  rewindDice,
  DICE_EFFECTS,
  RESERVE_TYPES,
  freshReserves,
  reserveCount,
} from "./rules.js";
import { browserSession, writeSession, SESSION_KEY } from "./session.js";
const THEMES = {
  sage: { name: "Salvia", light: "#e0e4cd", dark: "#7e9780" },
  walnut: { name: "Nogal", light: "#f0d9b5", dark: "#b58863" },
  ocean: { name: "Océano", light: "#d8e5ed", dark: "#7196ad" },
  graphite: { name: "Grafito", light: "#d4d4d6", dark: "#777c88" },
};
const LEVELS = ["Explorador", "Estratega", "Maestro", "Élite"];
const VARIANTS = {
  comecome: {
    name: "Come-come",
    tag: "PIERDE PIEZAS. GANA LA PARTIDA.",
    desc: "A veces, ganar significa quedarse sin nada.",
    character: "NYX",
    role: "La estratega del sacrificio",
    image: "/nyx.png",
    accent: "green",
  },
  correlativo: {
    name: "Correlativo",
    tag: "MÁS MOVIMIENTOS. MÁS POSIBILIDADES.",
    desc: "Piensa más allá de tu siguiente movimiento.",
    character: "KAIRO",
    role: "El arquitecto del tiempo",
    image: "/kairo.png",
    accent: "purple",
  },
  azar: {
    name: "Azar",
    tag: "EL AZAR PROPONE. TÚ DECIDES.",
    desc: "Seis caras. Un nuevo destino.",
    character: "VEGA",
    role: "La maestra del azar",
    image: "/vega.png",
    accent: "amber",
  },
  renacer: {
    name: "Renacer",
    tag: "NINGUNA PIEZA DICE SU ÚLTIMA PALABRA.",
    desc: "Tu próxima jugada puede ser un regreso.",
    character: "IRIS",
    role: "La guardiana de las segundas oportunidades",
    image: "/iris.png",
    accent: "cyan",
  },
};
const loadedSession = browserSession();
const saved = loadedSession.session;
function downloadRecovery() {
  let raw = loadedSession.raw;
  if (!raw) {
    try {
      raw = localStorage.getItem(SESSION_KEY);
    } catch {}
  }
  if (!raw) return;
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "evolution-chess-partida-respaldo.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
class GameBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("Evolution Chess no pudo renderizar la partida:", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="startup-recovery">
        <span className="eyebrow">EVOLUTION CHESS · RECUPERACIÓN</span>
        <h1>No hemos podido abrir la partida.</h1>
        <p>
          Puedes recargar o descargar el registro guardado antes de iniciar una
          partida nueva.
        </p>
        <div className="modal-button-row">
          <button className="button primary" onClick={() => location.reload()}>
            Volver a cargar
          </button>
          <button className="button secondary" onClick={downloadRecovery}>
            Descargar copia
          </button>
        </div>
        <button
          className="text-button"
          onClick={() => {
            if (
              !confirm(
                "¿Crear una partida nueva? Se descargará primero una copia del registro guardado.",
              )
            )
              return;
            downloadRecovery();
            try {
              const raw = localStorage.getItem(SESSION_KEY);
              if (raw) {
                try {
                  localStorage.setItem("nexo-session-backup", raw);
                } catch {}
              }
              localStorage.removeItem(SESSION_KEY);
            } catch {}
            location.reload();
          }}
        >
          Crear una partida nueva
        </button>
      </div>
    );
  }
}
function IconButton({ title, children, onClick, disabled, className = "" }) {
  return (
    <button
      className={"icon-button " + className}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function App() {
  const [storageWarning, setStorageWarning] = useState(loadedSession.warning);
  const [recovering, setRecovering] = useState(loadedSession.recoveryRequired);
  const [game, setGame] = useState(saved?.game || initial()),
    [started, setStarted] = useState(saved?.started || false),
    [mode, setMode] = useState(saved?.mode || "bot"),
    [level, setLevel] = useState(saved?.level || 2),
    [human, setHuman] = useState(saved?.human || "w"),
    [time, setTime] = useState(saved?.time || 0),
    [clocks, setClocks] = useState(saved?.clocks || { w: 0, b: 0 });
  const [theme, setTheme] = useState(saved?.theme || "sage"),
    [pieces, setPieces] = useState(
      saved?.pieces === "alpha" ? "chessnut" : saved?.pieces || "merida",
    ),
    [flipped, setFlipped] = useState(saved?.flipped || false),
    [sound, setSound] = useState(saved?.sound ?? true),
    [showHints, setShowHints] = useState(true);
  const [view, setView] = useState("play"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [selection, setSelection] = useState(null),
    [promotion, setPromotion] = useState(null),
    [busy, setBusy] = useState(false),
    [engineError, setEngineError] = useState(""),
    [hint, setHint] = useState(null),
    [review, setReview] = useState(-1),
    [analysisScore, setAnalysisScore] = useState(null),
    [evalBusy, setEvalBusy] = useState(false),
    [theater, setTheater] = useState(false),
    [mobileMenu, setMobileMenu] = useState(false),
    [pending, setPending] = useState(null),
    [autoReplay, setAutoReplay] = useState(false),
    [names, setNames] = useState(
      saved?.names || { w: "Jugador 1", b: "Jugador 2" },
    ),
    [retry, setRetry] = useState(0),
    [rolling, setRolling] = useState(false),
    [removal, setRemoval] = useState(null);
  const diceTimer = useRef(null);
  const gameRef = useRef(game),
    requestId = useRef(0),
    historyRef = useRef(null);
  gameRef.current = game;
  const variant = VARIANTS[game.variant],
    isAnalysis = view === "analysis",
    moves = useMemo(() => legalMoves(game), [game]),
    activeGame = started && !game.result && !isAnalysis;
  const isDice = game.variant === "azar";
  const isRenacer = game.variant === "renacer";
  const waitingRoll = isDice && game.dice?.phase === "roll";
  const isRemoving = isDice && game.dice?.phase === "remove";
  const myTurn = mode === "local" || game.turn === human;
  const reviewed = isAnalysis && review >= 0 ? game.history[review] : null;
  const displayFen = isAnalysis
    ? reviewed?.fen || initial(game.variant).fen
    : game.fen;
  const board = boardFromFen(displayFen),
    displayTurn = isAnalysis ? reviewed?.nextTurn || "w" : game.turn;
  const displayedReserves = isAnalysis
    ? reviewed?.reservesAfter || freshReserves()
    : game.reserves || freshReserves();
  const last = isAnalysis ? reviewed : game.history.at(-1),
    selectedMoves = selection ? moves.filter((m) => m.from === selection) : [];
  const counts = {
    w: board.filter((p) => p?.color === "w").length,
    b: board.filter((p) => p?.color === "b").length,
  };
  const captureRequired =
    game.variant === "comecome" && moves.some((m) => m.captured);
  const isRunning = started && !game.result;
  function notify(t) {
    setToast(t);
  }
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (recovering) return;
    let ok = false;
    try {
      ok = writeSession(window.localStorage, {
        game,
        started,
        mode,
        level,
        human,
        time,
        clocks,
        theme,
        pieces,
        flipped,
        sound,
        names,
      });
    } catch {}
    if (!ok)
      setStorageWarning(
        "No se puede guardar automáticamente en este navegador. El juego sigue disponible; descarga la partida antes de cerrar.",
      );
  }, [
    game,
    started,
    mode,
    level,
    human,
    time,
    clocks,
    theme,
    pieces,
    flipped,
    sound,
    names,
    recovering,
  ]);
  useEffect(() => {
    if (historyRef.current)
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [game.history.length]);
  function playSound(capture) {
    if (!sound) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(),
        g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.frequency.value = capture ? 220 : 520;
      g.gain.setValueAtTime(0.035, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
      osc.onended = () => ctx.close();
    } catch {}
  }
  function throwDie() {
    if (!activeGame || !myTurn || !waitingRoll || rolling || busy) return;
    setRolling(true);
    const current = gameRef.current;
    diceTimer.current = setTimeout(() => {
      if (gameRef.current === current && !current.result) {
        setGame(rollDice(current, randomFace()));
        setSelection(null);
        setHint(null);
        playSound(false);
      }
      setRolling(false);
    }, 650);
  }
  useEffect(() => () => clearTimeout(diceTimer.current), []);
  function execute(m) {
    const current = gameRef.current;
    if (current.result || !started) return;
    const valid = legalMoves(current).find((x) => uci(x) === uci(m));
    if (!valid) return;
    setSelection(null);
    setHint(null);
    setPromotion(null);
    setRemoval(null);
    if (modal === "remove") setModal(null);
    playSound(!!valid.captured);
    setGame((g) => (g.result ? g : applyMove(g, valid)));
  }
  useEffect(() => {
    if (!activeGame || mode !== "bot" || myTurn || engineError) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    setBusy(true);
    if (waitingRoll) setRolling(true);
    const timer = setTimeout(async () => {
      try {
        if (game.variant === "azar" && game.dice.phase === "roll") {
          if (id === requestId.current) setGame(rollDice(game, randomFace()));
          return;
        }
        const data = await engineMove(
          { ...game, history: [], positions: [] },
          level,
          controller.signal,
        );
        if (id !== requestId.current) return;
        const m = legalMoves(gameRef.current).find((x) => uci(x) === data.move);
        if (!m) throw new Error("No se pudo validar la jugada.");
        execute(m);
      } catch (e) {
        if (e.name !== "AbortError" && id === requestId.current)
          setEngineError(e.message);
      } finally {
        if (id === requestId.current) setBusy(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
      requestId.current++;
      setBusy(false);
      setRolling(false);
    };
  }, [game, activeGame, mode, myTurn, level, retry]);
  useEffect(() => {
    if (!isRunning || !time || engineError) return;
    let prev = Date.now();
    const interval = setInterval(() => {
      const now = Date.now(),
        delta = (now - prev) / 1000;
      prev = now;
      setClocks((c) => ({
        ...c,
        [game.turn]: Math.max(0, c[game.turn] - delta),
      }));
    }, 200);
    return () => clearInterval(interval);
  }, [game.turn, isRunning, time, engineError]);
  useEffect(() => {
    if (isRunning && time && clocks[game.turn] <= 0)
      setGame((g) => ({
        ...g,
        result: { winner: other(g.turn), reason: "Tiempo agotado." },
      }));
  }, [clocks, isRunning, time, game.turn]);
  useEffect(() => {
    if (game.result) {
      setBusy(false);
      setPromotion(null);
      setRemoval(null);
      clearTimeout(diceTimer.current);
      setRolling(false);
      setModal("result");
    }
  }, [game.result]);
  useEffect(() => {
    setAnalysisScore(null);
    setAutoReplay(false);
  }, [view]);
  useEffect(() => {
    if (!autoReplay) return;
    const t = setInterval(
      () =>
        setReview((n) => {
          if (n >= game.history.length - 1) {
            setAutoReplay(false);
            return n;
          }
          return n + 1;
        }),
      1000,
    );
    return () => clearInterval(t);
  }, [autoReplay, game.history.length]);
  useEffect(() => {
    function key(e) {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "Escape") {
        setModal(null);
        setSelection(null);
        setMobileMenu(false);
      }
      if (isAnalysis && e.key === "ArrowLeft")
        setReview((x) => Math.max(-1, x - 1));
      if (isAnalysis && e.key === "ArrowRight")
        setReview((x) => Math.min(game.history.length - 1, x + 1));
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [isAnalysis, game.history.length]);
  function reset(v = game.variant) {
    requestId.current++;
    clearTimeout(diceTimer.current);
    setRolling(false);
    setRemoval(null);
    setGame(initial(v));
    setStarted(false);
    setSelection(null);
    setHint(null);
    setEngineError("");
    setBusy(false);
    setView("play");
    setModal(null);
    setClocks({ w: time * 60, b: time * 60 });
    setReview(-1);
  }
  function requestReset(v = game.variant) {
    if (isRunning && game.history.length) {
      setPending(v);
      setModal("new");
    } else reset(v);
  }
  function start() {
    if (recovering) {
      notify(
        "Primero descarga el registro si lo necesitas y pulsa Crear nueva partida en el aviso.",
      );
      return;
    }
    setClocks({ w: time * 60, b: time * 60 });
    setStarted(true);
    setFlipped(mode === "bot" && human === "b");
    setEngineError("");
    notify(
      mode === "local"
        ? "¡Que empiece la partida! Compartid el tablero."
        : `${variant.character} está listo. ¡Buena partida!`,
    );
  }
  function chooseReserve(color, piece) {
    if (!activeGame || !myTurn || busy || color !== game.turn) return;
    if (!moves.some((m) => m.kind === "drop" && m.piece === piece)) {
      notify(
        "Esta pieza no tiene ninguna colocación legal: no puede dar jaque ni dejar tu rey amenazado.",
      );
      return;
    }
    setHint(null);
    setSelection((x) => (x === "@" + piece ? null : "@" + piece));
  }
  function chooseSquare(s) {
    if (!activeGame || !myTurn || busy || rolling) return;
    if (waitingRoll) {
      notify("Primero tira el dado para conocer tu acción.");
      return;
    }
    if (isRemoving) {
      const m = moves.find((m) => m.to === s);
      if (m) {
        setRemoval(m);
        setModal("remove");
      } else
        notify("Elige una pieza rival marcada. El rey no se puede retirar.");
      return;
    }
    if (selection) {
      const ms = selectedMoves.filter((m) => m.to === s);
      if (ms.length) {
        if (ms[0].promotion) setPromotion(ms);
        else execute(ms[0]);
        return;
      }
    }
    if (
      selection?.startsWith("@") &&
      (!board[index(s)] || board[index(s)].color !== game.turn)
    ) {
      notify(
        "Coloca en una casilla vacía, sin dar jaque ni dejar tu rey en jaque. Los peones también tienen filas restringidas.",
      );
      return;
    }
    const p = board[index(s)];
    setSelection(
      p?.color === game.turn && moves.some((m) => m.from === s) ? s : null,
    );
  }
  function undo() {
    if (!game.history.length || isAnalysis) return;
    requestId.current++;
    setEngineError("");
    let length = game.history.length - 1;
    if (mode === "bot") {
      while (length > 0 && game.history[length].color !== human) length--;
    }
    let g;
    if (isDice) g = rewindDice(game, length);
    else {
      g = initial(game.variant);
      for (let i = 0; i < length; i++) {
        const m = legalMoves(g).find((m) => uci(m) === uci(game.history[i]));
        if (m) g = applyMove(g, m);
      }
    }
    setGame(g);
    setSelection(null);
    setHint(null);
    setModal(null);
    notify("Jugada deshecha. El reloj no se reinicia.");
  }
  function download(format = "pgn") {
    const playerNames =
      mode === "local"
        ? names
        : {
            [human]: "Tú",
            [other(human)]: variant.character + " · " + LEVELS[level - 1],
          };
    const data =
      format === "pgn"
        ? pgn(game, playerNames)
        : JSON.stringify(
            { version: 1, game, mode, level, human, names },
            null,
            2,
          );
    const url = URL.createObjectURL(
      new Blob([data], {
        type:
          format === "pgn"
            ? "application/x-chess-pgn;charset=utf-8"
            : "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `evolution-chess-${game.variant}-${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Partida descargada.");
  }
  async function requestHint() {
    if (!activeGame || !myTurn || busy || waitingRoll || rolling) return;
    setBusy(true);
    const fen = game.fen;
    try {
      const data = await engineMove({ ...game, history: [], positions: [] }, 2);
      if (gameRef.current.fen !== fen) return;
      const m = moves.find((m) => uci(m) === data.move);
      setHint(m);
      setSelection(m.from);
      notify(
        m.kind === "remove"
          ? `Sugerencia: retira la pieza de ${m.to}`
          : m.kind === "drop"
            ? `Sugerencia: coloca ${PIECE_NAMES[m.piece].toLowerCase()} de tu reserva en ${m.to}`
            : `Sugerencia: ${m.from} → ${m.to}`,
      );
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  function openAnalysis() {
    if (isRunning) {
      notify("Termina la partida para abrir el análisis.");
      return;
    }
    setView("analysis");
    setReview(game.history.length - 1);
    setModal(null);
    setMobileMenu(false);
  }
  async function evaluatePosition() {
    setEvalBusy(true);
    setAnalysisScore(null);
    try {
      const data = await engineEvaluate(displayFen, game.variant);
      setAnalysisScore({ ...data, fen: displayFen });
    } catch (e) {
      notify(e.message);
    } finally {
      setEvalBusy(false);
    }
  }
  function playerName(c) {
    return mode === "local" ? names[c] : c === human ? "Tú" : variant.character;
  }
  function timeString(c) {
    if (!time) return "∞";
    const n = Math.ceil(clocks[c]);
    return (
      String(Math.floor(n / 60)).padStart(2, "0") +
      ":" +
      String(n % 60).padStart(2, "0")
    );
  }
  function Player({ color, top }) {
    const bot = mode === "bot" && color !== human;
    const active = displayTurn === color && (started || isAnalysis);
    return (
      <div className={"player-row " + (active ? "active" : "")}>
        <div className={"player-avatar " + (bot ? "bot" : "")}>
          {bot ? <img src={variant.image} /> : <Users size={20} />}
          <i className={active ? "online" : ""} />
        </div>
        <div className="player-copy">
          <strong>
            {playerName(color)}
            {bot && <span className="mini-badge">MÓDULO</span>}
            {!bot && mode === "local" && (
              <span className="player-label">LOCAL</span>
            )}
          </strong>
          <span>
            {bot
              ? LEVELS[level - 1]
              : color === "w"
                ? "Piezas blancas"
                : "Piezas negras"}
            <span className="middot">·</span>
            {counts[color]} piezas
          </span>
        </div>
        <div className={"clock " + (active ? "active-clock" : "")}>
          {active && <i />}
          {timeString(color)}
        </div>
      </div>
    );
  }
  const groups = useMemo(() => {
    const arr = [];
    game.history.forEach((m, i) => {
      let g = arr.at(-1);
      if (!g || g.turnIndex !== m.turnIndex) {
        g = { turnIndex: m.turnIndex, color: m.color, moves: [] };
        arr.push(g);
      }
      g.moves.push({ ...m, i });
    });
    return arr;
  }, [game.history]);
  const chartPoints = useMemo(() => {
    const fs = [initial(game.variant).fen, ...game.history.map((h) => h.fen)];
    return fs
      .map((f, i) => {
        const b = boardFromFen(f);
        const val =
          game.variant === "comecome"
            ? b.filter((p) => p?.color === "b").length -
              b.filter((p) => p?.color === "w").length
            : (material(f).w - material(f).b) / 100;
        return `${(i / Math.max(fs.length - 1, 1)) * 300},${50 - Math.max(-16, Math.min(16, val)) * 2.5}`;
      })
      .join(" ");
  }, [game.history, game.variant]);
  return (
    <div
      className={
        "app " +
        (theater ? "theater " : "") +
        (game.variant === "correlativo"
          ? "purple-mode"
          : isDice
            ? "amber-mode"
            : isRenacer
              ? "cyan-mode"
              : "")
      }
      style={{
        "--light-square": THEMES[theme].light,
        "--dark-square": THEMES[theme].dark,
      }}
    >
      <aside className={"sidebar " + (mobileMenu ? "mobile-open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("play");
          }}
        >
          <span className="brand-icon">E</span>
          <span>
            EVOLUTION CHESS
          </span>
        </a>
        <div className="brand-caption">EL AJEDREZ EVOLUCIONA</div>
        <div className="nav-label">EXPLORA</div>
        <nav>
          <button
            className={view === "play" ? "nav-item selected" : "nav-item"}
            onClick={() => {
              setView("play");
              setMobileMenu(false);
            }}
          >
            <Swords size={20} />
            Jugar
            <span className="nav-live" />
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setModal("appearance");
              setMobileMenu(false);
            }}
          >
            <Palette size={20} />
            Apariencia
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setModal("rules");
              setMobileMenu(false);
            }}
          >
            <BookOpen size={20} />
            Reglas de juego
            <ArrowUpRight size={14} className="nav-end" />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-label">TU UNIVERSO</div>
        <div className="lab-note">
          <span className="lab-icon">
            <Layers3 size={18} />
          </span>
          <div>
            Más allá de lo clásico
            <small>Cuatro variantes. Infinitas ideas.</small>
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="side-help">
            <div className="side-help-symbol">
              <Sparkles size={20} />
            </div>
            <strong>Cambia las reglas.</strong>
            <p>
              Descubre una nueva forma
              <br />
              de pensar el ajedrez.
            </p>
            <button onClick={() => setModal("rules")}>
              Explorar las variantes <ArrowRight size={15} />
            </button>
          </div>
          <div className="local-status">
            <span className="status-dot" />
            <span>Tu partida se guarda aquí</span>
            <ShieldCheck size={14} />
          </div>
          <div className="sidebar-footer">
            <span>EVOLUTION CHESS LAB</span>
            <span>v0.3 BETA</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <IconButton
              title="Menú"
              className="mobile-toggle"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={20} />
            </IconButton>
            <span>Zona de juego</span>
            <ChevronRight size={13} />
            <strong>{isAnalysis ? "Análisis" : "Sala de juego"}</strong>
          </div>
          <div className="top-actions">
            <span className="live-status">
              <i />
              TODO EMPIEZA CON UNA JUGADA
            </span>
            <span className="top-separator" />
            <IconButton
              title={sound ? "Silenciar sonidos" : "Activar sonidos"}
              onClick={() => setSound(!sound)}
            >
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </IconButton>
            <IconButton
              title="Ajustes de apariencia"
              onClick={() => setModal("appearance")}
            >
              <Settings2 size={18} />
            </IconButton>
            <span className="user-avatar">TÚ</span>
          </div>
        </header>
        <main>
          {storageWarning && (
            <div className="storage-warning" role="status">
              <ShieldCheck size={19} />
              <div>
                <strong>
                  {recovering
                    ? "Tu registro guardado está protegido"
                    : "Guardado automático no disponible"}
                </strong>
                <p>{storageWarning}</p>
                {recovering && (
                  <div>
                    <button onClick={downloadRecovery}>
                      Descargar copia original
                    </button>
                    <button
                      onClick={() => {
                        try {
                          localStorage.setItem(
                            "nexo-session-backup",
                            loadedSession.raw,
                          );
                        } catch {}
                        setRecovering(false);
                        setStorageWarning("");
                        reset();
                      }}
                    >
                      Crear nueva partida
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                AJEDREZ ALTERNATIVO
              </div>
              <h1>
                {isAnalysis ? "Cada jugada cuenta." : "Otra forma de jugar."}
              </h1>
              <p>
                {isAnalysis
                  ? "Rebobina, explora y encuentra tu próxima gran idea."
                  : "El mismo tablero. Nuevas reglas. Tu siguiente desafío."}
              </p>
            </div>
            <button
              className="button secondary new-game"
              onClick={() => requestReset()}
            >
              <Plus size={17} /> Nueva partida
            </button>
          </div>
          <div className="variant-selector">
            <button
              className={
                "variant-card " + (game.variant === "comecome" ? "chosen" : "")
              }
              onClick={() =>
                game.variant !== "comecome" && requestReset("comecome")
              }
            >
              <span className="variant-symbol">
                <Swords size={25} strokeWidth={1.6} />
              </span>
              <div>
                <div className="variant-name">
                  Come-come <span className="variant-badge">ANTICHESS</span>
                </div>
                <p>Pierde todas tus piezas. Gana.</p>
              </div>
              <span className="variant-check">
                {game.variant === "comecome" ? (
                  <Check size={14} />
                ) : (
                  <ArrowUpRight size={16} />
                )}
              </span>
            </button>
            <button
              className={
                "variant-card correlated " +
                (game.variant === "correlativo" ? "chosen" : "")
              }
              onClick={() =>
                game.variant !== "correlativo" && requestReset("correlativo")
              }
            >
              <span className="variant-symbol">
                <Layers3 size={25} strokeWidth={1.6} />
              </span>
              <div>
                <div className="variant-name">
                  Correlativo{" "}
                  <span className="variant-badge">EVOLUCIONADO</span>
                </div>
                <p>Encadena jugadas. Cambia el ritmo.</p>
              </div>
              <span className="variant-check">
                {game.variant === "correlativo" ? (
                  <Check size={14} />
                ) : (
                  <ArrowUpRight size={16} />
                )}
              </span>
            </button>
            <button
              className={
                "variant-card dice-variant " + (isDice ? "chosen" : "")
              }
              onClick={() => !isDice && requestReset("azar")}
            >
              <span className="variant-symbol">
                <Dices size={25} strokeWidth={1.6} />
              </span>
              <div>
                <div className="variant-name">
                  Azar <span className="variant-badge">NUEVA</span>
                </div>
                <p>Seis caras. Tú decides el destino.</p>
              </div>
              <span className="variant-check">
                {isDice ? <Check size={14} /> : <ArrowUpRight size={16} />}
              </span>
            </button>
            <button
              className={
                "variant-card renacer-variant " + (isRenacer ? "chosen" : "")
              }
              onClick={() => !isRenacer && requestReset("renacer")}
            >
              <span className="variant-symbol">
                <RefreshCcw size={24} strokeWidth={1.6} />
              </span>
              <div>
                <div className="variant-name">
                  Renacer <span className="variant-badge">NUEVA</span>
                </div>
                <p>Cada pieza tiene otra oportunidad.</p>
              </div>
              <span className="variant-check">
                {isRenacer ? <Check size={14} /> : <ArrowUpRight size={16} />}
              </span>
            </button>
          </div>
          <div className="game-layout">
            <section className="board-column">
              {!isRunning && (
                <button
                  className="button primary board-start"
                  onClick={() => (started ? reset() : start())}
                >
                  <Swords size={17} />
                  {started ? "Nueva partida" : "Empezar partida"}
                  <ArrowRight size={17} />
                </button>
              )}
              <Player color={flipped ? "w" : "b"} top />
              {isRenacer && (
                <ReserveBar
                  color={flipped ? "w" : "b"}
                  reserves={displayedReserves}
                  pieces={pieces}
                  active={
                    activeGame &&
                    myTurn &&
                    !busy &&
                    game.turn === (flipped ? "w" : "b")
                  }
                  selected={selection}
                  onSelect={chooseReserve}
                  reviewing={isAnalysis}
                />
              )}
              <div className="board-frame">
                <div
                  className="chessboard"
                  role="grid"
                  aria-label={"Tablero de " + variant.name}
                >
                  {Array.from({ length: 64 }, (_, k) => {
                    const i = flipped ? 63 - k : k,
                      s = square(i),
                      p = board[i],
                      r = Math.floor(i / 8),
                      c = i % 8,
                      allowed = (
                        isRemoving && activeGame && myTurn
                          ? moves
                          : selectedMoves
                      ).some((m) => m.to === s),
                      isLast = last && (s === last.from || s === last.to),
                      checked =
                        !isAnalysis &&
                        p?.type === "k" &&
                        p.color === game.turn &&
                        inCheck(game);
                    return (
                      <button
                        key={s}
                        role="gridcell"
                        aria-label={`${s}${p ? " " + (p.color === "w" ? "blanca " : "negra ") + { p: "peón", r: "torre", n: "caballo", b: "alfil", q: "dama", k: "rey" }[p.type] : ""}`}
                        className={
                          "square " +
                          ((r + c) % 2 === 0 ? "light" : "dark") +
                          (selection === s && !isAnalysis
                            ? " selected-square"
                            : "") +
                          (isLast ? " last-move" : "") +
                          (isRenacer &&
                          selection?.startsWith("@") &&
                          allowed &&
                          !isAnalysis
                            ? " drop-square"
                            : "") +
                          (checked ? " checked" : "") +
                          (isRemoving && allowed && !isAnalysis
                            ? " removable"
                            : "") +
                          (hint?.to === s ? " hinted" : "")
                        }
                        onClick={() => chooseSquare(s)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = e.dataTransfer.getData("text/plain");
                          if (!activeGame || !myTurn || busy) return;
                          const ms = moves.filter(
                            (m) => m.from === from && m.to === s,
                          );
                          if (ms.length) {
                            if (ms[0].promotion) setPromotion(ms);
                            else execute(ms[0]);
                          }
                        }}
                      >
                        {k % 8 === 0 && (
                          <span className="rank-label">{8 - r}</span>
                        )}
                        {k >= 56 && (
                          <span className="file-label">{"abcdefgh"[c]}</span>
                        )}
                        {p && (
                          <img
                            draggable={
                              activeGame &&
                              myTurn &&
                              p.color === game.turn &&
                              !busy
                            }
                            onDragStart={(e) => {
                              if (
                                !activeGame ||
                                !myTurn ||
                                p.color !== game.turn ||
                                busy
                              ) {
                                e.preventDefault();
                                return;
                              }
                              e.dataTransfer.setData("text/plain", s);
                              setSelection(s);
                            }}
                            src={`/pieces/${pieces}/${p.color}${p.type.toUpperCase()}.svg`}
                            alt=""
                          />
                        )}
                        {allowed && showHints && !isAnalysis && (
                          <span className={p ? "capture-ring" : "move-dot"} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {isRenacer && (
                <ReserveBar
                  color={flipped ? "b" : "w"}
                  reserves={displayedReserves}
                  pieces={pieces}
                  active={
                    activeGame &&
                    myTurn &&
                    !busy &&
                    game.turn === (flipped ? "b" : "w")
                  }
                  selected={selection}
                  onSelect={chooseReserve}
                  reviewing={isAnalysis}
                />
              )}
              <Player color={flipped ? "b" : "w"} />
              <div className="board-toolbar">
                <div className="turn-status">
                  <span className={"status-dot " + (busy ? "pulse" : "")} />
                  {isAnalysis ? (
                    <span>
                      {review < 0
                        ? "Posición inicial"
                        : `Movimiento ${review + 1} de ${game.history.length}`}
                    </span>
                  ) : game.result ? (
                    <span>Partida finalizada</span>
                  ) : !started ? (
                    <span>Todo listo para jugar</span>
                  ) : rolling ? (
                    <span>Lanzando el dado…</span>
                  ) : waitingRoll ? (
                    <span>
                      Turno de{" "}
                      <strong>
                        {game.turn === "w" ? "blancas" : "negras"}
                      </strong>{" "}
                      · tira el dado
                    </span>
                  ) : busy ? (
                    <span>
                      {myTurn
                        ? "Buscando una idea…"
                        : `${variant.character} está pensando…`}
                    </span>
                  ) : (
                    <span>
                      Turno de{" "}
                      <strong>
                        {game.turn === "w" ? "blancas" : "negras"}
                      </strong>
                      {isRenacer && selection?.startsWith("@") && (
                        <span className="turn-counter reserve-counter">
                          Coloca {PIECE_NAMES[selection[1]]?.toLowerCase()}
                        </span>
                      )}
                      {isDice && (
                        <span className="turn-counter dice-counter">
                          {isRemoving
                            ? "Retira una pieza"
                            : game.dice?.reply
                              ? "Respuesta · sin tirada"
                              : `${game.dice?.total - game.remaining + 1}/${game.dice?.total}`}
                        </span>
                      )}
                      {game.variant === "correlativo" && (
                        <span className="turn-counter">
                          {budget(game.turnIndex) - game.remaining + 1}/
                          {budget(game.turnIndex)}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="toolbar-actions">
                  <IconButton
                    title="Girar tablero"
                    onClick={() => setFlipped(!flipped)}
                  >
                    <ArrowLeftRight size={17} />
                  </IconButton>
                  <IconButton
                    title="Deshacer jugada"
                    disabled={
                      !game.history.length || busy || rolling || isAnalysis
                    }
                    onClick={undo}
                  >
                    <RotateCcw size={16} />
                  </IconButton>
                  <IconButton
                    title="Pedir una pista"
                    disabled={
                      !activeGame || !myTurn || busy || waitingRoll || rolling
                    }
                    onClick={requestHint}
                  >
                    <Lightbulb size={17} />
                  </IconButton>
                  <span className="toolbar-divider" />
                  <IconButton
                    title={theater ? "Vista normal" : "Ampliar tablero"}
                    onClick={() => setTheater(!theater)}
                  >
                    {theater ? (
                      <Minimize2 size={17} />
                    ) : (
                      <Maximize2 size={17} />
                    )}
                  </IconButton>
                </div>
              </div>
              {isAnalysis && (
                <div className="replay-controls">
                  <IconButton
                    title="Posición inicial"
                    onClick={() => setReview(-1)}
                  >
                    <ChevronsLeft size={19} />
                  </IconButton>
                  <IconButton
                    title="Jugada anterior"
                    disabled={review < 0}
                    onClick={() => setReview((n) => n - 1)}
                  >
                    <ChevronLeft size={19} />
                  </IconButton>
                  <IconButton
                    title={autoReplay ? "Pausar" : "Reproducir partida"}
                    disabled={!game.history.length}
                    onClick={() => {
                      if (review >= game.history.length - 1) setReview(-1);
                      setAutoReplay(!autoReplay);
                    }}
                  >
                    {autoReplay ? <Pause size={18} /> : <Play size={18} />}
                  </IconButton>
                  <IconButton
                    title="Jugada siguiente"
                    disabled={review >= game.history.length - 1}
                    onClick={() => setReview((n) => n + 1)}
                  >
                    <ChevronRight size={19} />
                  </IconButton>
                  <IconButton
                    title="Última posición"
                    onClick={() => setReview(game.history.length - 1)}
                  >
                    <ChevronsRight size={19} />
                  </IconButton>
                  <input
                    aria-label="Recorrer partida"
                    type="range"
                    min="-1"
                    max={Math.max(-1, game.history.length - 1)}
                    value={review}
                    onChange={(e) => setReview(Number(e.target.value))}
                  />
                </div>
              )}
              <div
                className={
                  "rule-strip " +
                  (captureRequired && activeGame ? "forced" : "")
                }
              >
                <span className="rule-icon">
                  {isRenacer ? (
                    <RefreshCcw size={18} />
                  ) : isDice ? (
                    <Dices size={18} />
                  ) : game.variant === "comecome" ? (
                    <Target size={18} />
                  ) : (
                    <Layers3 size={18} />
                  )}
                </span>
                <p>
                  {isRenacer ? (
                    <>
                      <strong>
                        {selection?.startsWith("@")
                          ? "Elige una casilla marcada."
                          : "Tu reserva, tu segunda oportunidad."}
                      </strong>{" "}
                      Mover o colocar consume tu turno. Coloca sin capturar ni
                      dar jaque; tu rey siempre a salvo.
                    </>
                  ) : isDice ? (
                    <>
                      <strong>
                        {game.dice?.reply
                          ? "Responde una vez. Después te toca tirar."
                          : waitingRoll
                            ? "Todo empieza con una tirada."
                            : DICE_EFFECTS[game.dice?.face]?.title + "."}
                      </strong>{" "}
                      {game.dice?.fallback ||
                        (game.dice?.reply
                          ? "No des jaque todavía: vas a seguir jugando."
                          : waitingRoll
                            ? "El rey nunca se puede dejar en jaque ni retirar del tablero."
                            : DICE_EFFECTS[game.dice?.face]?.text)}
                    </>
                  ) : game.variant === "comecome" ? (
                    <>
                      <strong>
                        {captureRequired && activeGame
                          ? "¡Captura obligatoria!"
                          : "Menos es más."}
                      </strong>{" "}
                      {captureRequired && activeGame
                        ? "Elige cuál de las capturas disponibles quieres realizar."
                        : "Si puedes capturar, debes hacerlo. El rey es una pieza más."}
                    </>
                  ) : (
                    <>
                      <strong>
                        {activeGame
                          ? `${game.remaining} ${game.remaining === 1 ? "movimiento restante" : "movimientos restantes"}.`
                          : "Piensa en secuencias."}
                      </strong>{" "}
                      {game.remaining > 1 && activeGame
                        ? "No puedes dar jaque todavía."
                        : "Solo se permite dar jaque en la última jugada del turno."}
                    </>
                  )}
                </p>
                <button
                  title="Consultar reglas"
                  aria-label="Consultar reglas"
                  onClick={() => setModal("rules")}
                >
                  <CircleHelp size={17} />
                </button>
              </div>
            </section>
            <aside className="game-panel">
              {isRenacer && !isAnalysis && (
                <section className="panel-card reserve-intro">
                  <div className="panel-heading">
                    <h2>
                      <RefreshCcw size={17} /> Una segunda oportunidad
                    </h2>
                    <button
                      className="icon-button"
                      title="Reglas de Renacer"
                      onClick={() => setModal("rules-renacer")}
                    >
                      <CircleHelp size={15} />
                    </button>
                  </div>
                  <p>
                    Lo que te capturan vuelve a <strong>tu reserva</strong>, no
                    a la de tu rival. Recupera una pieza en lugar de mover.
                  </p>
                  <div className="reserve-conditions">
                    <span>
                      <Check size={12} />
                      Casilla vacía
                    </span>
                    <span>
                      <Check size={12} />
                      Sin dar jaque
                    </span>
                    <span>
                      <Check size={12} />
                      Un turno
                    </span>
                  </div>
                  <div className="reserve-pawn-rule">
                    <img src={`/pieces/${pieces}/wP.svg`} alt="" />
                    <p>
                      Peones blancos: <strong>filas 2–6</strong>
                      <br />
                      Peones negros: <strong>filas 3–7</strong>
                    </p>
                  </div>
                </section>
              )}
              {isDice && !isAnalysis && (
                <DiceTray
                  game={game}
                  started={started}
                  myTurn={myTurn}
                  rolling={rolling}
                  busy={busy}
                  onRoll={throwDie}
                  onRules={() => setModal("rules-azar")}
                  playerName={playerName}
                />
              )}
              {!isAnalysis ? (
                <>
                  <section
                    className={
                      "panel-card setup-panel" +
                      ((isDice || isRenacer) && started
                        ? " dice-setup-active"
                        : "")
                    }
                  >
                    <div className="panel-heading">
                      <h2>Tu próxima partida</h2>
                      <span className="small-label">
                        {started ? "EN JUEGO" : "CONFIGURACIÓN"}
                      </span>
                    </div>
                    <div className="mode-switch">
                      <button
                        disabled={isRunning}
                        className={mode === "bot" ? "active" : ""}
                        onClick={() => setMode("bot")}
                      >
                        <Cpu size={16} />
                        Contra módulo
                      </button>
                      <button
                        disabled={isRunning}
                        className={mode === "local" ? "active" : ""}
                        onClick={() => setMode("local")}
                      >
                        <Users size={16} />2 jugadores
                      </button>
                    </div>
                    {mode === "bot" ? (
                      <>
                        <div className={"opponent-card " + variant.accent}>
                          <div className="opponent-text">
                            <div className="opponent-tag">
                              <span /> TU RIVAL
                            </div>
                            <h3>
                              {variant.character}
                              <span>
                                {" "}
                                / 0
                                {game.variant === "comecome"
                                  ? "1"
                                  : isDice
                                    ? "3"
                                    : isRenacer
                                      ? "4"
                                      : "2"}
                              </span>
                            </h3>
                            <p>{variant.role}</p>
                            <div className="engine-tag">
                              <Cpu size={11} />
                              {game.variant === "comecome"
                                ? "FAIRY-STOCKFISH"
                                : isDice
                                  ? "STOCKFISH + DADOS"
                                  : isRenacer
                                    ? "STOCKFISH + RESERVAS"
                                    : "STOCKFISH + ADAPTADOR"}
                            </div>
                          </div>
                          <img
                            src={variant.image}
                            alt={`${variant.character}, rival androide futurista`}
                          />
                        </div>
                        <div className="field-label">
                          <span>Nivel del módulo</span>
                          <span className="level-name">
                            {LEVELS[level - 1]}
                          </span>
                        </div>
                        <div className="level-selector">
                          {LEVELS.map((n, i) => (
                            <button
                              disabled={isRunning}
                              title={n}
                              key={n}
                              className={level === i + 1 ? "active" : ""}
                              onClick={() => setLevel(i + 1)}
                            >
                              <span className="level-bars">
                                {[1, 2, 3, 4].map((b) => (
                                  <i
                                    key={b}
                                    style={{
                                      height: 5 + b * 3,
                                      opacity: b <= i + 1 ? 1 : 0.17,
                                    }}
                                  />
                                ))}
                              </span>
                              {i + 1}
                            </button>
                          ))}
                        </div>
                        <div className="game-options">
                          <div>
                            <label>Juegas con</label>
                            <div className="color-picker">
                              <button
                                disabled={isRunning}
                                className={human === "w" ? "active" : ""}
                                onClick={() => setHuman("w")}
                                title="Jugar con blancas"
                              >
                                <span className="white-token" />
                                Blancas
                              </button>
                              <button
                                disabled={isRunning}
                                className={human === "b" ? "active" : ""}
                                onClick={() => setHuman("b")}
                                title="Jugar con negras"
                              >
                                <span className="black-token" />
                                Negras
                              </button>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="time">Tiempo</label>
                            <div className="select-wrap">
                              <select
                                id="time"
                                disabled={isRunning}
                                value={time}
                                onChange={(e) =>
                                  setTime(Number(e.target.value))
                                }
                              >
                                <option value="0">Sin límite</option>
                                <option value="5">5 minutos</option>
                                <option value="10">10 minutos</option>
                                <option value="15">15 minutos</option>
                              </select>
                              <ChevronDown size={14} />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="local-setup">
                        <div className="local-illustration">
                          <Users size={32} />
                          <span>Un tablero. Dos mentes.</span>
                          <p>Jugad juntos en este dispositivo.</p>
                        </div>
                        <div className="name-fields">
                          <label>
                            <span className="white-token" />
                            Blancas
                            <input
                              maxLength={20}
                              disabled={isRunning}
                              aria-label="Nombre de blancas"
                              value={names.w}
                              onChange={(e) =>
                                setNames((n) => ({ ...n, w: e.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span className="black-token" />
                            Negras
                            <input
                              maxLength={20}
                              disabled={isRunning}
                              aria-label="Nombre de negras"
                              value={names.b}
                              onChange={(e) =>
                                setNames((n) => ({ ...n, b: e.target.value }))
                              }
                            />
                          </label>
                        </div>
                        <div className="field-label">
                          <label htmlFor="local-time">Tiempo por jugador</label>
                          <select
                            id="local-time"
                            disabled={isRunning}
                            value={time}
                            onChange={(e) => setTime(Number(e.target.value))}
                          >
                            <option value="0">Sin límite</option>
                            <option value="5">5 minutos</option>
                            <option value="10">10 minutos</option>
                            <option value="15">15 minutos</option>
                          </select>
                        </div>
                      </div>
                    )}
                    {!started ? (
                      <button
                        className="button primary start-button"
                        onClick={start}
                      >
                        <Swords size={18} />
                        Empezar partida
                        <ArrowRight size={18} />
                      </button>
                    ) : game.result ? (
                      <button
                        className="button primary start-button"
                        onClick={() => reset()}
                      >
                        <RotateCcw size={18} />
                        Jugar otra vez
                        <ArrowRight size={18} />
                      </button>
                    ) : (
                      <div className="in-game-actions">
                        <button
                          className="button secondary"
                          onClick={() => setModal("resign")}
                        >
                          <Flag size={15} />
                          Rendirse
                        </button>
                        <button
                          className="button secondary"
                          onClick={() => setModal("draw")}
                        >
                          <span>½</span>Tablas
                        </button>
                      </div>
                    )}
                    <div className="setup-footnote">
                      <ShieldCheck size={12} />
                      {mode === "local"
                        ? "En este dispositivo · Sin registro"
                        : game.variant === "comecome"
                          ? "Motor real · Niveles sin Elo asignado"
                          : "Adaptador experimental · Sin Elo asignado"}
                    </div>
                    {engineError && (
                      <div className="engine-error">
                        {engineError}
                        <button
                          onClick={() => {
                            setEngineError("");
                            setRetry((r) => r + 1);
                          }}
                        >
                          Reintentar
                        </button>
                        <button
                          onClick={() => {
                            setMode("local");
                            setEngineError("");
                            notify(
                              "Ahora podéis continuar entre dos personas.",
                            );
                          }}
                        >
                          Continuar en local
                        </button>
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <section className="panel-card analysis-panel">
                  <div className="panel-heading">
                    <h2>
                      <Activity size={17} /> Tu partida, a fondo
                    </h2>
                    <span className="small-label">ANÁLISIS</span>
                  </div>
                  <div className="analysis-result">
                    <span>
                      {game.result
                        ? game.result.winner === null
                          ? "½ — ½"
                          : game.result.winner === "w"
                            ? "1 — 0"
                            : "0 — 1"
                        : "—"}
                    </span>
                    <strong>
                      {game.result
                        ? game.result.winner === null
                          ? "Tablas"
                          : `Ganan ${game.result.winner === "w" ? "blancas" : "negras"}`
                        : "Explora la posición"}
                    </strong>
                    <p>
                      {game.result?.reason ||
                        "Juega tu primera partida para descubrir su recorrido."}
                    </p>
                  </div>
                  <div className="stats-grid">
                    <div>
                      <strong>{game.history.length}</strong>
                      <span>Movimientos</span>
                    </div>
                    <div>
                      <strong>
                        {game.history.filter((h) => h.captured).length}
                      </strong>
                      <span>{isDice ? "Capturas / retiros" : "Capturas"}</span>
                    </div>
                    <div>
                      <strong>
                        {isRenacer
                          ? game.history.filter((h) => h.kind === "drop").length
                          : groups.length}
                      </strong>
                      <span>{isRenacer ? "Recolocaciones" : "Turnos"}</span>
                    </div>
                  </div>
                  <div className="chart-heading">
                    {game.variant === "comecome"
                      ? "Diferencia de piezas"
                      : "Balance de material"}
                    <span>Blancas ↑</span>
                  </div>
                  <svg
                    className="analysis-chart"
                    viewBox="0 0 300 100"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient
                        id="chartfill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#c3ee7c"
                          stopOpacity=".24"
                        />
                        <stop
                          offset="100%"
                          stopColor="#c3ee7c"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>
                    <path
                      d={`M0,100 L${chartPoints.replaceAll(" ", " L")} L300,100 Z`}
                      fill="url(#chartfill)"
                    />
                    <line
                      x1="0"
                      y1="50"
                      x2="300"
                      y2="50"
                      stroke="#40483f"
                      strokeDasharray="4 4"
                    />
                    <polyline
                      points={chartPoints}
                      fill="none"
                      stroke="#c3ee7c"
                      strokeWidth="2"
                    />
                  </svg>
                  <p className="chart-note">
                    {game.variant === "comecome"
                      ? "Arriba: las blancas tienen menos piezas."
                      : isRenacer
                        ? "Material sobre el tablero; no incluye las reservas ni indica probabilidad de victoria."
                        : "Balance material, no probabilidad de victoria."}
                  </p>
                  <button
                    className="button secondary evaluate-button"
                    disabled={evalBusy}
                    onClick={evaluatePosition}
                  >
                    {evalBusy ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Cpu size={16} />
                    )}
                    Evaluar esta posición
                  </button>
                  {analysisScore?.fen === displayFen && (
                    <div className="evaluation">
                      <strong>
                        {analysisScore.score?.type === "mate"
                          ? (isRenacer ? "Mate clásico " : "Mate ") +
                            analysisScore.score.value
                          : (analysisScore.score?.value / 100).toFixed(2)}
                      </strong>
                      <span>
                        Desde el lado que mueve ·{" "}
                        {analysisScore.move && analysisScore.move !== "(none)"
                          ? "Idea: " + analysisScore.move
                          : "Sin jugada"}
                      </span>
                    </div>
                  )}
                  <p className="analysis-warning">
                    {game.variant === "comecome"
                      ? "Evaluación real de Fairy-Stockfish con bloqueo configurado como tablas."
                      : isRenacer
                        ? "Evaluación clásica orientativa: no tiene en cuenta las reservas. Puede señalar un mate que una colocación legal evite. No es la ventaja exacta de Renacer."
                        : isDice
                          ? "Evaluación clásica orientativa. No calcula las probabilidades de futuras tiradas ni las extracciones del dado; no es la ventaja exacta de Azar."
                          : "Evaluación orientativa de ajedrez clásico. Stockfish no entiende los turnos múltiples; no representa la ventaja real de esta variante."}
                  </p>
                </section>
              )}
              <section className="panel-card moves-panel">
                <div className="panel-heading">
                  <h2>
                    <Layers3 size={16} /> Movimientos
                  </h2>
                  <span className="move-count">{game.history.length}</span>
                </div>
                <div className="moves-list" ref={historyRef}>
                  {!game.history.length ? (
                    <div className="empty-moves">
                      <span>
                        <MoveUpRight size={23} strokeWidth={1.4} />
                      </span>
                      <p>Las grandes ideas empiezan aquí.</p>
                      <small>Tu primera jugada marcará el camino.</small>
                    </div>
                  ) : (
                    groups.map((g) => (
                      <div className="move-row" key={g.turnIndex}>
                        <span className="move-number">
                          {Math.floor(g.turnIndex / 2) + 1}
                          {g.color === "w" ? "." : "…"}
                        </span>
                        <span className={"piece-dot " + g.color} />
                        <div>
                          {g.moves.map((m) => (
                            <button
                              title={`${m.from} → ${m.to}${m.captured ? " · Captura" : ""}`}
                              className={
                                (
                                  isAnalysis
                                    ? review === m.i
                                    : m.i === game.history.length - 1
                                )
                                  ? "current"
                                  : ""
                              }
                              key={m.i}
                              onClick={() => {
                                return;
                                setView("analysis");
                                setReview(m.i);
                              }}
                            >
                              {isDice && (
                                <span
                                  className="history-die"
                                  title={`Dado ${m.diceFace}${m.diceReply ? " · respuesta sin tirada" : ""}`}
                                >
                                  {
                                    ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][
                                      m.diceFace
                                    ]
                                  }
                                </span>
                              )}
                              {m.san}
                              {(game.variant === "correlativo" || isDice) && (
                                <small>
                                  {m.step}/{m.budget}
                                </small>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="moves-footer">
                  <span>
                    {game.variant === "comecome"
                      ? "Capturas obligatorias"
                      : isDice
                        ? "Tiradas y extracciones guardadas"
                        : isRenacer
                          ? "Capturas a tu propia reserva"
                          : "Turnos progresivos"}
                  </span>
                  <button
                    disabled={!game.history.length}
                    onClick={() => download()}
                  >
                    <Download size={14} />
                    PGN
                  </button>
                </div>
              </section>
              <button className="rules-link" onClick={() => setModal("rules")}>
                <BookOpen size={18} />
                <div>
                  <strong>¿Cómo se juega a {variant.name}?</strong>
                  <span>Un minuto para cambiar tu perspectiva.</span>
                </div>
                <ArrowUpRight size={17} />
              </button>
            </aside>
          </div>
          <footer className="page-footer">
            <span>NO ES SOLO AJEDREZ. ES TU SIGUIENTE IDEA.</span>
            <div>
              <span className="footer-dot" />
              Juego local · Sin cuentas · Sin límites
            </div>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {(modal || promotion) && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !promotion) setModal(null);
          }}
        >
          <section
            className={"modal " + (modal === "rules" ? "rules-modal" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={
              promotion
                ? "Elige promoción"
                : modal === "appearance"
                  : "Evolution Chess"
            }
          >
            <IconButton
              title="Cerrar"
              className="modal-close"
              onClick={() => {
                setModal(null);
                setPromotion(null);
              }}
            >
              <X size={21} />
            </IconButton>
            {promotion ? (
              <>
                <span className="eyebrow">UN NUEVO COMIENZO</span>
                <h2>Elige tu promoción</h2>
                <p>
                  {game.variant === "comecome"
                    ? "También puedes promocionar a rey: no tiene privilegios especiales."
                    : "¿Qué pieza necesita tu estrategia?"}
                </p>
                <div className="promotion-options">
                  {promotion.map((m) => (
                    <button
                      key={m.promotion}
                      title={
                        {
                          q: "Dama",
                          r: "Torre",
                          b: "Alfil",
                          n: "Caballo",
                          k: "Rey",
                        }[m.promotion]
                      }
                      onClick={() => execute(m)}
                    >
                      <img
                        src={`/pieces/${pieces}/${m.color}${m.promotion.toUpperCase()}.svg`}
                      />
                    </button>
                  ))}
                </div>
              </>
            ) : modal === "appearance" ? (
              <>
                <span className="eyebrow">HAZLO TUYO</span>
                <h2>Tu tablero. Tu estilo.</h2>
                <p>Una nueva perspectiva, sin cambiar tu partida.</p>
                <h3 className="modal-section-title">Color del tablero</h3>
                <div className="theme-grid">
                  {Object.entries(THEMES).map(([id, t]) => (
                    <button
                      key={id}
                      className={theme === id ? "active" : ""}
                      onClick={() => setTheme(id)}
                    >
                      <span className="theme-preview">
                        {[0, 1, 2, 3].map((i) => (
                          <i
                            key={i}
                            style={{
                              background: i === 0 || i === 3 ? t.light : t.dark,
                            }}
                          />
                        ))}
                      </span>
                      <span>
                        {t.name}
                        {theme === id && <Check size={13} />}
                      </span>
                    </button>
                  ))}
                </div>
                <h3 className="modal-section-title">Familia de piezas</h3>
                <div className="piece-grid">
                  {["merida", "cburnett", "chessnut"].map((s) => (
                    <button
                      className={pieces === s ? "active" : ""}
                      key={s}
                      onClick={() => setPieces(s)}
                    >
                      <div>
                        <img src={`/pieces/${s}/wN.svg`} />
                        <img src={`/pieces/${s}/bB.svg`} />
                      </div>
                      <span>
                        {s === "merida"
                          ? "Mérida"
                          : s === "cburnett"
                            ? "Clásicas"
                            : "Modernas"}
                        {pieces === s && <Check size={14} />}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="settings-row">
                  <span>Mostrar movimientos posibles</span>
                  <button
                    role="switch"
                    aria-checked={showHints}
                    aria-label="Mostrar movimientos posibles"
                    className={"toggle " + (showHints ? "on" : "")}
                    onClick={() => setShowHints(!showHints)}
                  >
                    <i />
                  </button>
                </div>
                <div className="settings-row">
                  <span>Sonido de las piezas</span>
                  <button
                    role="switch"
                    aria-checked={sound}
                    aria-label="Sonido de las piezas"
                    className={"toggle " + (sound ? "on" : "")}
                    onClick={() => setSound(!sound)}
                  >
                    <i />
                  </button>
                </div>
                <p className="credits">
                  Piezas Mérida de Armando H. Marroquín, vía Lichess. Consulta
                  atribuciones y licencias en el proyecto.
                </p>
                <button
                  className="button primary full"
                  onClick={() => setModal(null)}
                >
                  Listo, a jugar <Check size={17} />
                </button>
              </>
            ) : modal === "rules" || modal?.startsWith("rules-") ? (
              <>
                <span className="eyebrow">EL MISMO TABLERO. OTRAS REGLAS.</span>
                <h2>
                  {
                    VARIANTS[modal === "rules" ? game.variant : modal.slice(6)]
                      ?.name
                  }
                </h2>
                <div className="rule-tabs">
                  {Object.entries(VARIANTS).map(([id, v]) => (
                    <button
                      key={id}
                      className={
                        (modal === "rules" ? game.variant : modal.slice(6)) ===
                        id
                          ? "active"
                          : ""
                      }
                      onClick={() => setModal("rules-" + id)}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
                <Rules
                  variant={modal === "rules" ? game.variant : modal.slice(6)}
                />
                <button
                  className="button primary full"
                  onClick={() => setModal(null)}
                >
                  Entendido <ArrowRight size={17} />
                </button>
              </>
            ) : modal === "remove" && removal ? (
              <>
                <span className="eyebrow">DADO 6 · EXTRACCIÓN</span>
                <h2>Una pieza menos para tu rival.</h2>
                <div className="remove-preview">
                  <img
                    src={`/pieces/${pieces}/${other(removal.color)}${removal.captured.toUpperCase()}.svg`}
                    alt="Pieza elegida"
                  />
                  <strong>{removal.to}</strong>
                </div>
                <p>
                  Retirarás esta pieza de {removal.to} y terminará tu turno.
                  Después tirará el rival.
                </p>
                <div className="modal-button-row">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setRemoval(null);
                      setModal(null);
                    }}
                  >
                    Elegir otra
                  </button>
                  <button
                    className="button primary"
                    onClick={() => execute(removal)}
                  >
                    <Trash2 size={16} />
                    Confirmar extracción
                  </button>
                </div>
              </>
            ) : modal === "result" ? (
              <>
                <div className="result-icon">
                  <Flag size={30} />
                </div>
                <span className="eyebrow">CADA FINAL ES UN COMIENZO</span>
                <h2>
                  {game.result?.winner === null
                    ? "Una mente a cada lado."
                    : `Ganan ${game.result?.winner === "w" ? "las blancas" : "las negras"}.`}
                </h2>
                <div className="result-score">
                  {game.result?.winner === null
                    ? "½ — ½"
                    : game.result?.winner === "w"
                      ? "1 — 0"
                      : "0 — 1"}
                </div>
                <p>{game.result?.reason}</p>
                <button className="button primary full" onClick={() => reset()}>
                  <RotateCcw size={18} />
                  Jugar otra vez
                  <ArrowRight size={18} />
                </button>
                <div className="modal-button-row">
                  <button
                    className="button secondary"
                    onClick={() => download()}
                  >
                    <Download size={16} />
                    Descargar PGN
                  </button>
                  <button className="button secondary" onClick={() => reset()}>
                    <Plus size={16} />
                    Nueva partida
                  </button>
                </div>
                <button
                  className="text-button full"
                  onClick={() => download("json")}
                >
                  Descargar registro completo · JSON
                </button>
              </>
            ) : modal === "new" ? (
              <>
                <span className="eyebrow">UNA NUEVA HISTORIA</span>
                <h2>¿Empezamos de nuevo?</h2>
                <p>
                  La partida actual se reemplazará. Puedes descargarla antes de
                  continuar.
                </p>
                <div className="modal-button-row">
                  <button
                    className="button secondary"
                    onClick={() => download()}
                  >
                    <Download size={16} />
                    Guardar PGN
                  </button>
                  <button
                    className="button primary"
                    onClick={() => reset(pending)}
                  >
                    Nueva partida
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ) : modal === "resign" ? (
              <>
                <span className="eyebrow">DECISIÓN DE PARTIDA</span>
                <h2>¿Quieres rendirte?</h2>
                <p>
                  {mode === "bot" ? "Tú" : playerName(game.turn)} abandonarás la
                  partida. Ganarán{" "}
                  {(mode === "bot" ? human : game.turn) === "w"
                    ? "las negras"
                    : "las blancas"}
                  .
                </p>
                <button
                  className="button primary full"
                  onClick={() => {
                    const loser = mode === "bot" ? human : game.turn;
                    setGame((g) => ({
                      ...g,
                      result: {
                        winner: other(loser),
                        reason: `${loser === "w" ? "Las blancas" : "Las negras"} se han rendido.`,
                      },
                    }));
                    setModal(null);
                  }}
                >
                  Confirmar rendición
                  <Flag size={17} />
                </button>
              </>
            ) : modal === "draw" ? (
              <>
                <span className="eyebrow">ACUERDO ENTRE JUGADORES</span>
                <h2>¿Declaramos tablas?</h2>
                <p>
                  {mode === "local"
                    ? "Confirma solo si ambos jugadores estáis de acuerdo."
                    : "En este modo de entrenamiento, el módulo acepta tus propuestas de tablas."}
                </p>
                <button
                  className="button primary full"
                  onClick={() => {
                    setGame((g) => ({
                      ...g,
                      result: { winner: null, reason: "Tablas por acuerdo." },
                    }));
                    setModal(null);
                  }}
                >
                  Confirmar tablas <Check size={17} />
                </button>
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
function Rules({ variant }) {
  if (variant === "renacer") return <RenacerRules />;
  if (variant === "azar") return <DiceRules />;
  return (
    <div className="rules-content">
      {variant === "comecome" ? (
        <>
          <div>
            <span>01</span>
            <section>
              <h3>Quedarte sin piezas es ganar.</h3>
              <p>
                Gana quien pierde todas sus piezas, incluido el rey. No hay
                jaque ni jaque mate: el rey se mueve una casilla y se puede
                capturar.
              </p>
            </section>
          </div>
          <div>
            <span>02</span>
            <section>
              <h3>Si puedes comer, tienes que comer.</h3>
              <p>
                La captura es obligatoria en cada jugada. Si hay varias capturas
                disponibles, puedes elegir cualquiera.
              </p>
            </section>
          </div>
          <div>
            <span>03</span>
            <section>
              <h3>Un bloqueo termina en tablas.</h3>
              <p>
                Si conservas piezas pero no tienes jugadas legales, la partida
                es tablas. Sin enroque. Se permite captura al paso y promoción a
                dama, torre, alfil, caballo o rey.
              </p>
            </section>
          </div>
          <div className="rules-note">
            <Cpu size={17} />
            <p>
              Fairy-Stockfish juega con estas reglas, incluida la modificación
              de bloqueo = tablas. Los cuatro niveles son de dificultad, no Elo.
            </p>
          </div>
        </>
      ) : (
        <>
          <div>
            <span>01</span>
            <section>
              <h3>El turno crece. Luego cambia de ritmo.</h3>
              <p>
                Primeros turnos: blancas 1, negras 2, blancas 3, negras 4,
                blancas 5, negras 6. Después el número de movimientos por turno
                repite el ciclo 2, 3, 4, 5, 6, alternando colores.
              </p>
              <div className="sequence">
                {[1, 2, 3, 4, 5, 6, 2, 3, 4, 5, 6, 2].map((v, i) => (
                  <span key={i} className={i % 2 === 0 ? "w" : "b"}>
                    {v}
                  </span>
                ))}
                <span>…</span>
              </div>
            </section>
          </div>
          <div>
            <span>02</span>
            <section>
              <h3>Jaque, solo al final de tu turno.</h3>
              <p>
                No puedes dar jaque en movimientos intermedios. Si empiezas en
                jaque, debes salir en la primera jugada. Nunca puedes dejar tu
                propio rey amenazado.
              </p>
            </section>
          </div>
          <div>
            <span>03</span>
            <section>
              <h3>El objetivo sigue siendo el mate.</h3>
              <p>
                Se mantienen movimientos, enroque y promoción normales. La
                captura al paso solo existe inmediatamente tras un doble avance
                que cierre el turno rival. Sin movimientos legales y sin jaque:
                tablas, también durante un turno.
              </p>
            </section>
          </div>
          <div className="rules-note">
            <Cpu size={17} />
            <p>
              Módulo experimental: Stockfish orienta un buscador que respeta los
              turnos y las restricciones. No es soporte nativo de Stockfish ni
              tiene Elo certificado.
            </p>
          </div>
        </>
      )}
      <p className="rules-small">
        En esta primera versión, triple repetición y 100 movimientos
        individuales sin peón ni captura producen tablas automáticamente. Los
        relojes son opcionales; agotarlos pierde la partida. La partida se
        guarda en este navegador. El PGN correlativo usa una extensión por
        turnos; utiliza JSON para conservar el registro completo.
      </p>
    </div>
  );
}

function randomFace() {
  const a = new Uint32Array(1);
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= 4294967292);
  return (a[0] % 6) + 1;
}
function Die({ face, rolling = false }) {
  const positions = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  return (
    <div
      className={
        "die-object " +
        (rolling ? "die-rolling" : "") +
        (!face ? " die-unrolled" : "")
      }
      aria-label={face ? `Dado: ${face}` : "Dado sin tirar"}
    >
      {face ? (
        Array.from({ length: 9 }, (_, i) => (
          <i
            key={i}
            className={positions[face].includes(i) ? "pip" : "pip empty"}
          />
        ))
      ) : (
        <Dices size={33} strokeWidth={1.4} />
      )}
    </div>
  );
}
function DiceTray({
  game,
  started,
  myTurn,
  rolling,
  busy,
  onRoll,
  onRules,
  playerName,
}) {
  const d = game.dice,
    waiting = d.phase === "roll",
    face = d.face;
  return (
    <section className="panel-card dice-panel">
      <div className="panel-heading">
        <h2>
          <Dices size={17} /> El dado del destino
        </h2>
        <button className="dice-help" title="Reglas del dado" onClick={onRules}>
          <CircleHelp size={15} />
        </button>
      </div>
      <div className="dice-stage">
        <Die face={rolling ? null : face} rolling={rolling} />
        <div>
          <span className="dice-kicker">
            {game.result
              ? "PARTIDA TERMINADA"
              : d.reply
                ? "RESPUESTA · SIN TIRADA"
                : !started
                  ? "SEIS POSIBILIDADES"
                  : playerName(game.turn) === "Tú"
                    ? "TU TURNO"
                    : `TURNO DE ${playerName(game.turn).toUpperCase()}`}
          </span>
          <h3>
            {rolling
              ? "El destino gira…"
              : d.reply
                ? "Mueve. Luego tira."
                : waiting
                  ? "¿Cuál será tu jugada?"
                  : DICE_EFFECTS[face].title}
          </h3>
          <p>
            {rolling
              ? "Una tirada, una nueva posibilidad."
              : d.reply
                ? "Responde una vez, sin dar jaque. Después el dado es tuyo."
                : waiting
                  ? "El azar propone. Tu estrategia decide."
                  : DICE_EFFECTS[face].text}
          </p>
        </div>
      </div>
      {d.fallback && (
        <div className="dice-fallback">
          <ShieldCheck size={15} />
          <span>{d.fallback}</span>
        </div>
      )}
      {waiting && !game.result ? (
        <button
          className="button primary roll-button"
          onClick={onRoll}
          disabled={!started || !myTurn || rolling || busy}
        >
          <Dices size={18} />
          {!started
            ? "Inicia la partida para tirar"
            : rolling
              ? "Lanzando…"
              : myTurn
                ? "Tirar dado"
                : `${playerName(game.turn)} va a tirar`}
          <ArrowRight size={16} />
        </button>
      ) : (
        <div className="dice-action-note">
          <span className="status-dot" />
          {game.result
            ? "Partida terminada. Descarga el PGN o juega otra vez."
            : d.phase === "remove"
              ? myTurn
                ? "Selecciona una pieza rival marcada en el tablero."
                : "VEGA elige qué pieza retirar."
              : `${game.remaining} ${game.remaining === 1 ? "jugada pendiente" : "jugadas pendientes"}${game.remaining > 1 ? " · Sin jaque todavía" : ""}`}
        </div>
      )}
      <div className="dice-legend">
        {Object.entries(DICE_EFFECTS).map(([n, e]) => (
          <button
            key={n}
            title={`${n}: ${e.title}`}
            onClick={onRules}
            className={Number(n) === face ? "active" : ""}
          >
            <span>{["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n]}</span>
            <small>
              {
                [
                  "",
                  "1 jugada",
                  "2 jugadas",
                  "Compartir",
                  "Alfil / C.",
                  "Exponer",
                  "Retirar",
                ][n]
              }
            </small>
          </button>
        ))}
      </div>
      <div className="dice-trace">
        {game.rolls?.length ? (
          <>
            Últimas tiradas{" "}
            <span>
              {game.rolls.slice(-8).map((r, i) => (
                <b
                  title={`${r.color === "w" ? "Blancas" : "Negras"} · ${r.face}`}
                  className={r.color}
                  key={i}
                >
                  {r.face}
                </b>
              ))}
            </span>
          </>
        ) : (
          <>Seis caras equiprobables · Sin tiradas elegidas</>
        )}
      </div>
    </section>
  );
}
function DiceRules() {
  return (
    <div className="rules-content dice-rules">
      <p className="dice-rules-intro">
        Gana por jaque mate. Antes de tu turno, tira el dado y aplica su efecto.
        Tu rey nunca puede quedar en jaque tras tu movimiento.
      </p>
      <div className="dice-rule-list">
        {Object.entries(DICE_EFFECTS).map(([face, e]) => (
          <section key={face}>
            <span>{["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][face]}</span>
            <div>
              <h3>{e.title}</h3>
              <p>{e.text}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="rules-note">
        <ShieldCheck size={18} />
        <p>
          <strong>El 5 no significa dejar el rey en jaque.</strong> Se exige una
          jugada legal tras la cual exista al menos una respuesta legal del
          rival que te dé jaque. Se comprueba la posibilidad en el tablero, sin
          anticipar su siguiente tirada; el rival no está obligado a
          aprovecharla.
        </p>
      </div>
      <p>
        <strong>Jaque solo al final de tu secuencia.</strong> Con el 2, solo en
        la segunda jugada. Con el 3, primero mueves tú y después responde el
        rival, que luego tira: su respuesta no puede dar jaque porque va a
        seguir jugando. Si recibe jaque, debe salir de él al responder.
      </p>
      <p>
        <strong>Si el efecto es imposible:</strong> con el 4 o el 5 juegas una
        vez con normalidad. La seguridad del rey también tiene prioridad sobre
        el 2 y el 6: si no hay primera jugada sin jaque o extracción legal, se
        permite una jugada normal. Nunca se elimina el rey. Retirar una torre de
        su casilla inicial anula ese derecho de enroque.
      </p>
      <p>
        El 6 termina el turno sin un movimiento adicional. La captura al paso
        solo dura hasta la acción inmediatamente siguiente; un doble avance
        intermedio no conserva ese derecho. Enroque, promoción, ahogado y mate
        siguen las reglas normales.
      </p>
      <div className="rules-note">
        <Cpu size={18} />
        <p>
          VEGA usa Stockfish con un adaptador experimental que respeta la tirada
          y las extracciones. No es soporte nativo de dados ni calcula todas las
          probabilidades futuras. La evaluación de análisis es solo orientativa.
        </p>
      </div>
      <p className="rules-small">
        Triple repetición y 100 movimientos individuales sin peón ni captura:
        tablas automáticas. Los retiros reinician ese contador. Tiradas,
        movimientos y piezas retiradas se guardan. Deshacer conserva la tirada
        original. El PGN es extendido; utiliza JSON para conservar el registro
        exacto.
      </p>
    </div>
  );
}

const PIECE_NAMES = {
  p: "Peón",
  n: "Caballo",
  b: "Alfil",
  r: "Torre",
  q: "Dama",
};
function ReserveBar({
  color,
  reserves,
  pieces,
  active,
  selected,
  onSelect,
  reviewing,
}) {
  const total = reserveCount(reserves, color);
  return (
    <section
      className={"reserve-bar " + (active ? "active-reserve" : "")}
      aria-label={`Reserva de ${color === "w" ? "blancas" : "negras"}`}
    >
      <div className="reserve-label">
        <PackageOpen size={15} />
        <div>
          <strong>{color === "w" ? "Reserva blanca" : "Reserva negra"}</strong>
          <span>
            {total
              ? `${total} ${total === 1 ? "pieza disponible" : "piezas disponibles"}`
              : reviewing
                ? "Sin piezas en reserva"
                : "Tus piezas capturadas volverán aquí"}
          </span>
        </div>
      </div>
      <div className="reserve-pieces">
        {RESERVE_TYPES.map((p) => {
          const count = reserves[color][p] || 0;
          return (
            <button
              key={p}
              className={
                "reserve-piece " +
                (!count ? "empty-reserve-piece " : "") +
                (active && selected === "@" + p ? "selected-reserve-piece" : "")
              }
              disabled={!count || !active}
              aria-label={`Reserva ${color === "w" ? "blanca" : "negra"}: ${PIECE_NAMES[p]}, ${count}`}
              title={
                !count
                  ? `${PIECE_NAMES[p]}: todavía no hay ninguno en tu reserva`
                  : active
                    ? `Colocar ${PIECE_NAMES[p].toLowerCase()}`
                    : "Disponible cuando te toque jugar"
              }
              onClick={() => onSelect(color, p)}
              draggable={active && count > 0}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", "@" + p);
                onSelect(color, p);
              }}
            >
              <img
                draggable={false}
                src={`/pieces/${pieces}/${color}${p.toUpperCase()}.svg`}
                alt=""
              />
              <span className="reserve-quantity">{count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
function RenacerRules() {
  return (
    <div className="rules-content renacer-rules">
      <div>
        <span>01</span>
        <section>
          <h3>Lo que pierdes, vuelve a ti.</h3>
          <p>
            Jugamos ajedrez normal, con una excepción: cada pieza capturada pasa
            a la reserva de su propietario, manteniendo su color. No se entrega
            al jugador que captura. El rey nunca entra en la reserva.
          </p>
        </section>
      </div>
      <div>
        <span>02</span>
        <section>
          <h3>Mover o recuperar. Una sola acción.</h3>
          <p>
            En tu turno puedes mover normalmente, con capturas y jaques
            normales, o colocar una pieza de tu reserva. La colocación ocupa el
            turno completo y solo puede hacerse en una casilla vacía: no
            captura, no da jaque y no deja a tu rey amenazado.
          </p>
        </section>
      </div>
      <div>
        <span>03</span>
        <section>
          <h3>Cada peón tiene su territorio.</h3>
          <p>
            Las filas se cuentan desde el lado de cada jugador. Peones blancos:
            solo filas 2 a 6; peones negros: solo filas 3 a 7. Se prohíben la
            primera, la penúltima y la última fila propias. Un peón colocado en
            su fila inicial puede después avanzar dos casillas, como en ajedrez
            normal.
          </p>
        </section>
      </div>
      <div>
        <span>04</span>
        <section>
          <h3>La promoción se conserva.</h3>
          <p>
            Si te capturan una dama que antes fue un peón, regresa a tu reserva
            como dama. Se aplica lo mismo a torre, alfil y caballo. Puedes
            volver a recuperar una pieza tantas veces como sea capturada.
          </p>
        </section>
      </div>
      <div className="rules-note">
        <ShieldCheck size={18} />
        <p>
          Una pieza de reserva puede bloquear un jaque si deja a tu rey a salvo
          y no da jaque al rival. Solo hay mate cuando no existe defensa, ni
          moviendo ni colocando. Devolver una torre no recupera derechos de
          enroque; colocar consume la oportunidad de captura al paso.
        </p>
      </div>
      <div className="rules-note">
        <Cpu size={18} />
        <p>
          IRIS usa Stockfish con un adaptador experimental de reservas propias;
          no es Crazyhouse ni soporte nativo de estas reglas. La evaluación
          numérica del análisis es clásica y no cuenta las reservas.
        </p>
      </div>
      <p className="rules-small">
        Se mantienen los relojes y las tablas automáticas por repetición o 100
        movimientos individuales sin peón ni captura. Las repeticiones cuentan
        las reservas. Material insuficiente: solo reyes o una única pieza menor
        entre tablero y reservas; no se declaran tablas automáticamente por
        alfiles del mismo color porque pueden recolocarse. El PGN usa notación
        extendida, como N@f3, y comentarios de reserva. JSON conserva el estado
        completo.
      </p>
    </div>
  );
}

export default function NexoGame() {
  return (
    <GameBoundary>
      <App />
    </GameBoundary>
  );
}
