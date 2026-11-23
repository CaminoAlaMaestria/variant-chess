// Campaign progress (seals / crew), versioned and separate from the saved game (SESSION_KEY).
export const CAMPAIGN_KEY = "evolution-campaign-v1";
const fresh = () => ({ version: 1, seals: [], crew: [] });

export function loadCampaign(storage) {
  try {
    const raw = storage?.getItem(CAMPAIGN_KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) return fresh();
    const list = (x) => (Array.isArray(x) ? [...new Set(x.filter((s) => typeof s === "string"))] : []);
    return { version: 1, seals: list(d.seals), crew: list(d.crew) };
  } catch {
    return fresh();
  }
}

export function saveCampaign(storage, c) {
  try {
    storage.setItem(CAMPAIGN_KEY, JSON.stringify(c));
    return JSON.parse(storage.getItem(CAMPAIGN_KEY) || "null")?.seals?.length === c.seals.length;
  } catch {
    return false;
  }
}

// A real, fresh human win against NYX: bot mode, Come-come, winner === human color,
// and only on the transition from "no result" to "result" during this session.
export function isNyxWin({ prevResult, result, mode, variant, human }) {
  return !prevResult && !!result && mode === "bot" && variant === "comecome" && !!result.winner && result.winner === human;
}

// Idempotent: returns { campaign, granted } — granted false when NYX was already recruited.
export function recruitNyx(c) {
  if (c.seals.includes("nyx")) return { campaign: c, granted: false };
  return {
    campaign: { ...c, seals: [...c.seals, "nyx"], crew: [...new Set([...c.crew, "nyx"])] },
    granted: true,
  };
}
