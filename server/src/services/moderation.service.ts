// ─────────────────────────────────────────────────────────────────────────────
// Service de modération centralisé — Storyforge
//
// Politique : application strictement tout public.
// Toute ambiguïté est bloquée.
//
// Usage :  moderateText(text)  → { isAllowed: boolean; category?: string }
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModerationResult = {
  isAllowed: boolean;
  category?: string;
};

// Message renvoyé aux clients (volontairement non informatif)
export const MOD_REFUSED = "Ce contenu n'est pas autorisé sur Storyforge.";

// ── Normalisation ─────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// ── Termes interdits ──────────────────────────────────────────────────────────
//
// Deux modes de correspondance :
//   "substr" — la chaîne est recherchée comme sous-chaîne (termes longs ≥ 6 car)
//   "word"   — entouré de délimiteurs non-alphanumériques (termes courts ambigus)
//
// Catégories : insultes · violence · haine · sexuel · religion

type MatchMode = "word" | "substr";
type Entry = [string, string, MatchMode]; // [catégorie, terme, mode]

// Jeu de caractères alphanumériques français (y compris accentués)
const FR = "a-zàâäéèêëîïôùûüÿæœ";

function makeWordRe(term: string): RegExp {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^${FR}0-9])${esc}(?:$|[^${FR}0-9])`, "i");
}

const BANNED: Entry[] = [
  // ── Insultes / grossièretés (FR) ──────────────────────────────────────────
  ["insultes", "putain",              "substr"],
  ["insultes", "salope",              "substr"],
  ["insultes", "salaud",              "substr"],
  ["insultes", "connard",             "substr"],
  ["insultes", "connasse",            "substr"],
  ["insultes", "enculé",              "substr"],
  ["insultes", "enculer",             "substr"],
  ["insultes", "encule",              "substr"],
  ["insultes", "fdp",                 "word"],
  ["insultes", "fils de pute",        "substr"],
  ["insultes", "couilles",            "substr"],
  ["insultes", "couillon",            "substr"],
  ["insultes", "niquer",              "substr"],
  ["insultes", "niqué",               "substr"],
  ["insultes", "niquée",              "substr"],
  ["insultes", "nique ta",            "substr"],
  ["insultes", "va te faire foutre",  "substr"],
  ["insultes", "va te faire",         "substr"],
  ["insultes", "chiotte",             "substr"],
  ["insultes", "pute",                "word"],
  ["insultes", "merde",               "word"],
  ["insultes", "con",                 "word"],
  ["insultes", "conne",               "word"],
  ["insultes", "bite",                "word"],
  ["insultes", "bâtard",              "word"],
  ["insultes", "batard",              "word"],
  // ── Insultes / grossièretés (EN) ──────────────────────────────────────────
  ["insultes", "fuck",                "word"],
  ["insultes", "fucking",             "substr"],
  ["insultes", "fucker",              "substr"],
  ["insultes", "motherfucker",        "substr"],
  ["insultes", "shit",                "word"],
  ["insultes", "bullshit",            "substr"],
  ["insultes", "asshole",             "substr"],
  ["insultes", "bastard",             "word"],
  ["insultes", "bitch",               "word"],
  ["insultes", "cunt",                "word"],
  ["insultes", "whore",               "word"],
  ["insultes", "slut",                "word"],
  ["insultes", "douchebag",           "substr"],
  // ── Violence ──────────────────────────────────────────────────────────────
  ["violence", "viol",                "word"],
  ["violence", "viols",               "word"],
  ["violence", "violeur",             "word"],
  ["violence", "violeurs",            "word"],
  ["violence", "violée",              "word"],
  ["violence", "violé",               "word"],
  ["violence", "torture",             "word"],
  ["violence", "torturer",            "substr"],
  ["violence", "torturé",             "substr"],
  ["violence", "torturée",            "substr"],
  ["violence", "décapiter",           "substr"],
  ["violence", "décapitation",        "substr"],
  ["violence", "mutiler",             "substr"],
  ["violence", "mutilation",          "substr"],
  ["violence", "massacre",            "word"],
  ["violence", "massacrer",           "substr"],
  ["violence", "gore",                "word"],
  ["violence", "snuff",               "word"],
  ["violence", "tue-toi",             "substr"],
  ["violence", "tue toi",             "substr"],
  ["violence", "va te tuer",          "substr"],
  ["violence", "kill yourself",       "substr"],
  ["violence", "kys",                 "word"],
  ["violence", "suicide",             "word"],
  ["violence", "suicider",            "substr"],
  ["violence", "suicidez",            "substr"],
  ["violence", "pendaison",           "substr"],
  ["violence", "rape",                "word"],
  ["violence", "rapist",              "substr"],
  // ── Haine / discrimination ────────────────────────────────────────────────
  ["haine", "nigger",                 "substr"],
  ["haine", "nigga",                  "word"],
  ["haine", "nègre",                  "word"],
  ["haine", "négro",                  "substr"],
  ["haine", "pédé",                   "word"],
  ["haine", "tapette",                "word"],
  ["haine", "fiotte",                 "word"],
  ["haine", "tantouze",               "substr"],
  ["haine", "gouine",                 "word"],
  ["haine", "youpin",                 "substr"],
  ["haine", "youpine",                "substr"],
  ["haine", "kike",                   "word"],
  ["haine", "bougnoule",              "substr"],
  ["haine", "bicot",                  "word"],
  ["haine", "chintoque",              "substr"],
  ["haine", "chinetoque",             "substr"],
  ["haine", "niakoué",                "substr"],
  ["haine", "tranny",                 "word"],
  ["haine", "sale juif",              "substr"],
  ["haine", "sale arabe",             "substr"],
  ["haine", "sale noir",              "substr"],
  ["haine", "sale blanc",             "substr"],
  // ── Contenu sexuel ────────────────────────────────────────────────────────
  ["sexuel", "pornographie",          "substr"],
  ["sexuel", "pornographique",        "substr"],
  ["sexuel", "porno",                 "word"],
  ["sexuel", "porn",                  "word"],
  ["sexuel", "masturbation",          "substr"],
  ["sexuel", "masturber",             "substr"],
  ["sexuel", "se masturbe",           "substr"],
  ["sexuel", "branler",               "substr"],
  ["sexuel", "branlette",             "substr"],
  ["sexuel", "baise",                 "word"],
  ["sexuel", "baiser",                "word"],
  ["sexuel", "baisé",                 "word"],
  ["sexuel", "baisée",                "word"],
  ["sexuel", "baisait",               "substr"],
  ["sexuel", "baisent",               "substr"],
  ["sexuel", "sodomie",               "substr"],
  ["sexuel", "sodomiser",             "substr"],
  ["sexuel", "fellation",             "substr"],
  ["sexuel", "cunnilingus",           "substr"],
  ["sexuel", "orgie",                 "word"],
  ["sexuel", "inceste",               "substr"],
  ["sexuel", "pédophile",             "substr"],
  ["sexuel", "pédophilie",            "substr"],
  ["sexuel", "orgasme",               "word"],
  ["sexuel", "éjaculation",           "substr"],
  ["sexuel", "éjaculer",              "substr"],
  ["sexuel", "sexting",               "substr"],
  ["sexuel", "hentai",                "word"],
  ["sexuel", "vagin",                 "word"],
  ["sexuel", "nude",                  "word"],
  ["sexuel", "nudes",                 "word"],
  // ── Religion / prosélytisme offensif ──────────────────────────────────────
  ["religion", "djihad",              "substr"],
  ["religion", "jihad",               "word"],
  ["religion", "mort aux infidèles",  "substr"],
  ["religion", "convertissez-vous",   "substr"],
  ["religion", "rejoignez notre foi", "substr"],
  ["religion", "infidèles doivent",   "substr"],
  ["religion", "sale catholique",     "substr"],
  ["religion", "sale protestant",     "substr"],
  ["religion", "sale musulman",       "substr"],
  ["religion", "sale chrétien",       "substr"],
];

// ── Pré-compilation des regex ─────────────────────────────────────────────────

const COMPILED = BANNED.map(([category, term, mode]) => ({
  category,
  term,
  mode,
  re: mode === "word" ? makeWordRe(term) : null,
}));

// ── Fonction principale ────────────────────────────────────────────────────────

/**
 * Analyse un texte et retourne s'il est autorisé sur Storyforge.
 *
 * @param text     — Texte soumis par l'utilisateur
 * @param _context — Contexte facultatif (ex. "story.title") pour traçabilité future
 */
export function moderateText(
  text: string | null | undefined,
  _context?: string,
): ModerationResult {
  if (!text || typeof text !== "string" || !text.trim()) {
    return { isAllowed: true };
  }

  const n = normalize(text);

  for (const { category, term, mode, re } of COMPILED) {
    const matched = mode === "word" ? re!.test(n) : n.includes(term);
    if (matched) {
      return { isAllowed: false, category };
    }
  }

  // Spam par répétition excessive de caractères (ex. "aaaaaaaaaaaa")
  if (/(.)\1{8,}/.test(n)) {
    return { isAllowed: false, category: "spam" };
  }

  return { isAllowed: true };
}
