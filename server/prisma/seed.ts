import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, SceneStatus } from "../src/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Nettoyage des données existantes
  await prisma.contribution.deleteMany();
  await prisma.scene.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.story.deleteMany();

  const story = await prisma.story.create({
    data: {
      title: "Les Chroniques de Valdor",
      description: "Un royaume en crise, des héros à la destinée inconnue.",
      chapters: {
        create: {
          title: "Prologue — Les Braises du Passé",
          order: 1,
          scenes: {
            create: {
              title: "La Taverne des Ruines",
              description:
                "Une auberge délabrée à la lisière du Bois des Âmes. Trois étrangers se retrouvent autour d'un feu mourant.",
              order: 1,
              status: SceneStatus.ACTIVE,
              contributions: {
                create: [
                  {
                    content:
                      "Elle poussa la porte vermoulue. L'odeur de cendre et de bière rance l'accueillit comme une vieille connaissance.",
                  },
                  {
                    content:
                      "Un grognement sourd. Thorok laissa tomber son sac sur la table la plus robuste — la seule encore debout.",
                  },
                  {
                    content:
                      '"Le fil vous a conduits ici. Tous les trois. Ce n\'est pas un hasard." Elle s\'assit sans qu\'on l\'y invite.',
                  },
                ],
              },
            },
          },
        },
      },
    },
    include: {
      chapters: {
        include: {
          scenes: {
            include: { contributions: true },
          },
        },
      },
    },
  });

  const scene = story.chapters[0].scenes[0];
  console.log(`✔ Story créée      : ${story.title} (${story.id})`);
  console.log(`✔ Chapter créé     : ${story.chapters[0].title}`);
  console.log(`✔ Scene créée      : ${scene.title} [${scene.status}]`);
  console.log(`✔ Contributions    : ${scene.contributions.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
