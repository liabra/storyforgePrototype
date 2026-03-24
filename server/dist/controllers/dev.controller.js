"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seed = void 0;
const client_1 = __importDefault(require("../prisma/client"));
const client_2 = require("../generated/prisma/client");
const seed = async (_req, res) => {
    await client_1.default.story.deleteMany({});
    const story = await client_1.default.story.create({
        data: {
            title: "Les Chroniques de Valdor",
            description: "Un royaume en crise, des héros à la destinée inconnue.",
            characters: {
                create: [
                    {
                        name: "Aelindra",
                        nickname: "Elfe des Brumes",
                        role: "Éclaireur",
                        shortDescription: "Une elfe mystérieuse au passé trouble.",
                        faction: "Les Enfants de l'Aube",
                        appearance: "Cheveux argentés, yeux violets, cicatrice sur la joue gauche",
                        personality: "Méfiante mais loyale",
                    },
                    {
                        name: "Thorok",
                        nickname: "Briseur de Pierre",
                        role: "Guerrier",
                        shortDescription: "Un nain exilé cherchant rédemption.",
                        faction: "Clan Ironhold",
                        appearance: "Massif, barbe rousse tressée, armure gravée de runes",
                        personality: "Bourru mais protecteur",
                    },
                    {
                        name: null,
                        nickname: "La Tisseuse",
                        role: "Mage",
                        shortDescription: "Personne ne connaît son vrai nom.",
                        faction: "Ordre du Fil",
                        appearance: "Visage toujours voilé, mains couvertes de symboles",
                        personality: "Énigmatique, parle par énigmes",
                    },
                ],
            },
            chapters: {
                create: [
                    {
                        title: "Prologue — Les Braises du Passé",
                        order: 1,
                        scenes: {
                            create: [
                                {
                                    title: "La Taverne des Ruines",
                                    description: "Une auberge délabrée à la lisière du Bois des Âmes. Trois étrangers se retrouvent autour d'un feu mourant.",
                                    order: 1,
                                    status: client_2.SceneStatus.DONE,
                                },
                                {
                                    title: "La Route du Nord",
                                    description: "La troupe quitte la taverne à l'aube sous une pluie froide. La forêt s'épaissit.",
                                    order: 2,
                                    status: client_2.SceneStatus.ACTIVE,
                                },
                            ],
                        },
                    },
                    {
                        title: "Acte I — L'Éveil",
                        order: 2,
                        scenes: {
                            create: [
                                {
                                    title: "Le Château de Valdor",
                                    description: "Les ruines du château se dressent dans la brume du matin. Des inscriptions anciennes couvrent les murs.",
                                    order: 1,
                                    status: client_2.SceneStatus.ACTIVE,
                                },
                                {
                                    title: "La Chambre du Conseil",
                                    description: "Une salle secrète sous les décombres, encore intacte. Une table ronde et sept sièges vides.",
                                    order: 2,
                                    status: client_2.SceneStatus.ACTIVE,
                                },
                            ],
                        },
                    },
                ],
            },
        },
        include: {
            characters: true,
            chapters: { include: { scenes: true } },
        },
    });
    const firstScene = story.chapters[0].scenes[0];
    const aelindra = story.characters.find((c) => c.name === "Aelindra");
    const thorok = story.characters.find((c) => c.name === "Thorok");
    const tisseuse = story.characters.find((c) => c.nickname === "La Tisseuse");
    await client_1.default.scene.update({
        where: { id: firstScene.id },
        data: {
            characters: {
                set: [aelindra.id, thorok.id, tisseuse.id].map((id) => ({ id })),
            },
        },
    });
    await client_1.default.contribution.createMany({
        data: [
            {
                sceneId: firstScene.id,
                characterId: aelindra.id,
                content: "Elle poussa la porte vermoulue. L'odeur de cendre et de bière rance l'accueillit comme une vieille connaissance.",
            },
            {
                sceneId: firstScene.id,
                characterId: thorok.id,
                content: "Un grognement sourd. Thorok laissa tomber son sac sur la table la plus robuste — la seule encore debout.",
            },
            {
                sceneId: firstScene.id,
                characterId: tisseuse.id,
                content: "\"Le fil vous a conduits ici. Tous les trois. Ce n'est pas un hasard.\" Elle s'assit sans qu'on l'y invite.",
            },
            {
                sceneId: firstScene.id,
                characterId: aelindra.id,
                content: "Aelindra posa la main sur son couteau. \"Qui êtes-vous ?\"",
            },
            {
                sceneId: firstScene.id,
                characterId: tisseuse.id,
                content: "Un sourire sous le voile. \"Celle qui vous pose la même question.\"",
            },
        ],
    });
    return res.status(201).json({ message: "Seed réussi", storyId: story.id });
};
exports.seed = seed;
