import { Request, Response } from "express";
import { createStory } from "../services/story.service";
import { createCharacter } from "../services/character.service";
import { createScene } from "../services/scene.service";

export const seed = async (_req: Request, res: Response) => {
  const story = await createStory({
    title: "Les Chroniques de Valdor",
    description:
      "Une épopée fantastique dans un monde où la magie disparaît peu à peu.",
  });

  await Promise.all([
    createCharacter(story.id, {
      name: "Aelindra",
      description: "Archimage et gardienne des derniers sortilèges du royaume.",
    }),
    createCharacter(story.id, {
      name: "Theron",
      description: "Chevalier errant, porteur d'une malédiction ancienne.",
    }),
    createCharacter(story.id, {
      name: "Syla",
      description: "Voleuse aux doigts agiles, secrètement liée à la prophétie.",
    }),
  ]);

  await Promise.all(
    [
      { title: "Le Village en flammes", order: 1 },
      { title: "La Forêt des Ombres", order: 2 },
      { title: "La Tour de l'Archimage", order: 3 },
      { title: "Le Pacte interdit", order: 4 },
      { title: "L'Éveil du Dragon", order: 5 },
    ].map((scene) => createScene(story.id, scene))
  );

  return res.status(201).json({
    message: "Seed réussi",
    storyId: story.id,
  });
};
