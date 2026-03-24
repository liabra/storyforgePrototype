"use strict";
/**
 * Script de migration one-shot
 * À lancer UNE SEULE FOIS après `prisma db push` pour migrer les anciennes données.
 *
 * Lancer avec : cd server && npx ts-node src/scripts/migrate-to-chapters.ts
 *
 * Ce script :
 * 1. Crée un chapitre "Chapitre 1" pour chaque histoire existante
 * 2. Rattache les anciennes scènes (qui avaient storyId) à ce chapitre
 *    → Note : comme le champ storyId disparaît du schéma, prisma db push supprime
 *      les données. Ce script est utile uniquement si tu fais une migration manuelle
 *      SQL avant le push. Sinon, relance juste POST /api/dev/seed.
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const pg_1 = require("pg");
async function main() {
    const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Récupérer toutes les stories
        const { rows: stories } = await client.query('SELECT id, title FROM "Story"');
        for (const story of stories) {
            // Créer un chapitre par défaut
            const { rows: chapters } = await client.query(`INSERT INTO "Chapter" (id, title, description, "order", "storyId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, 1, $3, NOW(), NOW())
         RETURNING id`, [`Chapitre 1`, `Chapitre importé depuis "${story.title}"`, story.id]);
            const chapterId = chapters[0].id;
            // Tenter de rattacher les scènes existantes (si la colonne storyId existe encore)
            try {
                await client.query(`UPDATE "Scene" SET "chapterId" = $1 WHERE "storyId" = $2`, [chapterId, story.id]);
            }
            catch {
                console.log(`  Pas de colonne storyId sur Scene — migration des scènes ignorée.`);
            }
            console.log(`✓ Histoire "${story.title}" → chapitre créé (${chapterId})`);
        }
        await client.query("COMMIT");
        console.log("\nMigration terminée.");
    }
    catch (err) {
        await client.query("ROLLBACK");
        console.error("Erreur :", err);
        process.exit(1);
    }
    finally {
        client.release();
        await pool.end();
    }
}
main();
