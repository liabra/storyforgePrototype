/**
 * Backfill Phase A — Migration Story→Scene
 *
 * Renseigne Scene.storyId à partir de Scene.chapter.storyId
 * pour toutes les scènes existantes.
 *
 * À exécuter UNE SEULE FOIS après le premier db push (storyId nullable),
 * avant le second db push (storyId non-nullable).
 *
 * Usage : npx ts-node server/prisma/backfill-scene-storyid.ts
 */

import prisma from "../src/prisma/client";

async function backfill() {
  // ── 1. Recensement ──────────────────────────────────────────────────────────
  const scenes = await prisma.scene.findMany({
    where: { storyId: null },
    select: {
      id: true,
      chapter: { select: { storyId: true } },
    },
  });

  console.log(`📋 Scènes à traiter : ${scenes.length}`);

  if (scenes.length === 0) {
    console.log("✅ Aucune scène à mettre à jour — déjà effectué ou base vide");
    await verify();
    return;
  }

  // ── 2. Mise à jour ligne par ligne ──────────────────────────────────────────
  let updated = 0;
  let errors = 0;

  for (const scene of scenes) {
    const targetStoryId = scene.chapter?.storyId ?? null;

    if (!targetStoryId) {
      console.error(
        `❌ Scène ${scene.id} : chapitre absent ou sans storyId — impossible à backfiller`,
      );
      errors++;
      continue;
    }

    await prisma.scene.update({
      where: { id: scene.id },
      data: { storyId: targetStoryId },
    });
    updated++;
  }

  console.log(`✅ Mises à jour : ${updated}`);

  // ── 3. Arrêt si erreurs ─────────────────────────────────────────────────────
  if (errors > 0) {
    console.error(
      `❌ ${errors} scène(s) en erreur — corriger les données avant de continuer`,
    );
    process.exit(1);
  }

  // ── 4. Vérification finale obligatoire ──────────────────────────────────────
  await verify();
}

async function verify() {
  const remaining = await prisma.scene.count({ where: { storyId: null } });
  if (remaining > 0) {
    console.error(
      `❌ Vérification finale : ${remaining} scène(s) encore sans storyId — arrêt`,
    );
    process.exit(1);
  }
  console.log("✅ Vérification finale : 0 scène sans storyId — backfill complet");
}

backfill()
  .catch((err) => {
    console.error("Erreur fatale :", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
