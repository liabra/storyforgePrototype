# StoryForge — Contexte projet chef de projet claude.ai

## Structure clés
- client/src/App.tsx — interface principale (scènes, contributions, MJ)
- client/src/BattleApp.tsx — mode battle
- server/src/services/ai.service.ts — Maître du Jeu IA (Gemini)
- server/src/services/world.service.ts — World Memory extraction/injection
- server/src/services/scene.service.ts — gestion des scènes
- server/src/services/gm.scheduler.ts — scheduler MJ automatique
- server/prisma/schema.prisma — schéma base de données

## Stack
TypeScript, React, Node.js, Prisma/PostgreSQL, Socket.IO, Gemini Flash 2.5, Railway

## Variables d'environnement nécessaires
- GEMINI_API_KEY
- OPENAI_API_KEY
- DATABASE_URL

## État actuel des sprints
- ✅ Prompt MJ v3 (SYSTEM_PROMPT + MODE_INSTRUCTION + narrativePhase)
- ✅ World Memory — modèles Prisma + migration + world.service.ts
- ✅ MJ automatique — gm.scheduler.ts + suppression bouton client
- 🔜 Carte du monde — visualisation World Memory
- 🔜 Système de compte — email optionnel + code de récupération

## Modèles Prisma ajoutés
- WorldFragment (type, genre, label, weight, sourceStoryId)
- WorldFragmentUsage (fragmentId, usedInStoryId)

## Règle importante
L'IA est "un ami discret" — elle enrichit sans gérer, sans épier, sans s'imposer.
