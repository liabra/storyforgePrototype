# StoryForge — Contexte projet chef de projet claude.ai

## Structure clés
- client/src/App.tsx — interface principale (scènes, contributions, MJ)
- client/src/BattleApp.tsx — mode battle
- client/src/api.ts — configuration des appels API (BASE_URL via VITE_API_URL)
- server/src/services/ai.service.ts — Maître du Jeu IA (Gemini)
- server/src/services/world.service.ts — World Memory extraction/injection
- server/src/services/scene.service.ts — gestion des scènes
- server/src/services/gm.scheduler.ts — scheduler MJ automatique
- server/src/controllers/contribution.controller.ts — branché sur gm.scheduler
- server/src/controllers/scene.controller.ts — branché sur world.service (extraction DONE)
- server/src/types/express.d.ts — types globaux Express (req.user)
- server/prisma/schema.prisma — schéma base de données

## Stack
TypeScript, React, Node.js, Prisma/PostgreSQL, Socket.IO, Gemini Flash 2.5, Railway

## Variables d'environnement nécessaires
### Client (client/.env)
- VITE_API_URL=http://localhost:4000

### Serveur
- GEMINI_API_KEY
- DATABASE_URL

## État actuel des sprints
- ✅ Prompt MJ v3 (SYSTEM_PROMPT + MODE_INSTRUCTION + narrativePhase)
- ✅ Qualité MJ — maxOutputTokens 180, cooldown 10s, validation ponctuation, fallback
- ✅ MJ automatique — gm.scheduler.ts + suppression bouton client + socket gm_intervention
- ✅ World Memory — modèles Prisma (WorldFragment, WorldFragmentUsage) + world.service.ts
- ✅ Composant FlameIndicator — progression flamme dans l'en-tête de scène active
- ✅ Types Express — express.d.ts sans import Prisma (id, email, isAdmin?, isBanned?)
- ✅ Config client — VITE_API_URL + BASE URL corrigée dans api.ts
- ✅ Carte du monde — SVG interactif, filtres genre/type, accessible connectés uniquement
- ✅ Système de compte — email optionnel + pseudonyme + code de récupération 12 mots

## Modèles Prisma modifiés
- User : email nullable, pseudonym?, recoveryCodeHash?

## Modèles Prisma ajoutés
- WorldFragment (id, type, genre, label, weight, sourceStoryId, createdAt, updatedAt)
- WorldFragmentUsage (id, fragmentId, usedInStoryId, createdAt)

## Points d'architecture notables
- Le MJ est déclenché automatiquement : toutes les 5 contributions OU après 2 min de silence
- L'extraction World Memory se fait en fire-and-forget quand une scène passe en DONE
- Le cooldown anti-spam (10s + vérification nombre de contributions) est géré dans ai.service.ts
- La migration Prisma a été appliquée via db execute (Railway a un drift d'historique)

## Règle importante
L'IA est "un ami discret" — elle enrichit sans gérer, sans épier, sans s'imposer.
