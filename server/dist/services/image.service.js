"use strict";
/**
 * image.service.ts
 *
 * Service de génération d'image extensible.
 * Le provider actif est contrôlé par la variable IMAGE_PROVIDER.
 *
 * Providers disponibles :
 *   - "placeholder"  (défaut) — URL placehold.co, aucune clé requise
 *   - "cloudflare"             — Cloudflare Workers AI (stable-diffusion)
 *
 * Variables d'environnement :
 *   IMAGE_PROVIDER=placeholder | cloudflare
 *   CF_ACCOUNT_ID=<votre account ID Cloudflare>
 *   CF_API_TOKEN=<votre API token Cloudflare (permission AI:Run)>
 *   CF_IMAGE_MODEL=@cf/stabilityai/stable-diffusion-xl-base-1.0  (optionnel)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVisualPrompt = buildVisualPrompt;
exports.generateImage = generateImage;
// ─── Prompt builder ──────────────────────────────────────────────────────────
/**
 * Construit un prompt visuel cohérent depuis le contexte narratif.
 * Utilisé par les providers qui consomment un modèle de génération d'image.
 */
function buildVisualPrompt(ctx) {
    const parts = [];
    parts.push(`Fantasy digital illustration, scene titled "${ctx.sceneTitle}" from the story "${ctx.storyTitle}"`);
    if (ctx.content) {
        const excerpt = ctx.content.replace(/\s+/g, " ").trim().slice(0, 250);
        if (excerpt)
            parts.push(excerpt);
    }
    if (ctx.characterNames && ctx.characterNames.length > 0) {
        parts.push(`Characters present: ${ctx.characterNames.join(", ")}`);
    }
    parts.push("cinematic lighting, detailed background, atmospheric, painterly style, high quality");
    return parts.join(". ");
}
// ─── Providers ───────────────────────────────────────────────────────────────
/**
 * Placeholder : retourne une URL placehold.co.
 * Aucune clé API requise. Utilisé par défaut.
 */
const placeholderProvider = async (ctx) => {
    const label = ctx.sceneTitle.slice(0, 50);
    return `https://placehold.co/800x600/1e1b4b/ffffff?text=${encodeURIComponent(label)}`;
};
/**
 * Cloudflare Workers AI.
 *
 * Requiert :
 *   CF_ACCOUNT_ID — Dashboard Cloudflare > Workers & Pages > Overview
 *   CF_API_TOKEN  — API Tokens > Create Token > permission "Workers AI:Run"
 *   CF_IMAGE_MODEL (optionnel, défaut stable-diffusion-xl-base-1.0)
 *
 * L'API retourne un binaire PNG.
 * Pour le prototype, on stocke le résultat en data URL base64.
 * En production : uploader sur Cloudflare R2 ou un CDN et stocker l'URL publique.
 */
const cloudflareProvider = async (ctx) => {
    const accountId = process.env.CF_ACCOUNT_ID;
    const apiToken = process.env.CF_API_TOKEN;
    const model = process.env.CF_IMAGE_MODEL ??
        "@cf/stabilityai/stable-diffusion-xl-base-1.0";
    if (!accountId || !apiToken) {
        throw new Error("IMAGE_PROVIDER=cloudflare requiert CF_ACCOUNT_ID et CF_API_TOKEN dans .env");
    }
    const prompt = buildVisualPrompt(ctx);
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Cloudflare Workers AI error ${response.status}: ${body}`);
    }
    // Réponse binaire PNG → data URL base64 (suffisant pour le prototype)
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:image/png;base64,${base64}`;
};
// ─── Registre des providers ───────────────────────────────────────────────────
const PROVIDERS = {
    placeholder: placeholderProvider,
    cloudflare: cloudflareProvider,
};
// ─── Export principal ─────────────────────────────────────────────────────────
/**
 * Génère une image pour une scène et retourne son URL (ou data URL).
 * Le provider est sélectionné via IMAGE_PROVIDER dans .env.
 */
async function generateImage(ctx) {
    const providerKey = (process.env.IMAGE_PROVIDER ?? "placeholder").toLowerCase();
    const provider = PROVIDERS[providerKey];
    if (!provider) {
        console.warn(`[image.service] Provider inconnu "${providerKey}", fallback sur placeholder.`);
        return placeholderProvider(ctx);
    }
    return provider(ctx);
}
