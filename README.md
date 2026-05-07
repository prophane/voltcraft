# Voltcraft

**Self-hosted Tesla Fleet companion — local-only, Docker-powered, API-efficient.**

> Tesla® is a trademark of Tesla, Inc. Voltcraft is an independent project, not affiliated with or endorsed by Tesla.

---

## Présentation

Voltcraft est une application web auto-hébergée permettant de gérer vos véhicules Tesla depuis votre propre infrastructure, sans abonnement logiciel, sans composant SaaS, et sans dépendance cloud.

**Fonctionnalités MVP :**
- Dashboard premium avec batterie, statut, position, commandes rapides
- Envoi de commandes essentielles (verrouillage, climatisation, recharge…)
- Historique des trajets et sessions de recharge
- Statistiques d'usage sur 7/30 jours
- Automatisations locales planifiées
- Intégration Home Assistant via MQTT
- Mode Éco API par défaut pour limiter les coûts Fleet API Tesla

---

## Stack technique

| Couche     | Technologie                                      |
|------------|--------------------------------------------------|
| Frontend   | React 18, TypeScript, Vite, Tailwind CSS         |
| State      | TanStack Query, Zustand                          |
| UI         | Lucide React, Framer Motion, Recharts, Leaflet   |
| Backend    | Node.js, Fastify, TypeScript                     |
| ORM        | Prisma + PostgreSQL                              |
| Cache      | Redis + BullMQ                                   |
| MQTT       | Mosquitto                                        |
| Infra      | Docker Compose uniquement                        |

---

## Prérequis

- Docker + Docker Compose installés
- Accès Tesla Fleet API (compte développeur Tesla enregistré)
- [Optionnel] Broker MQTT externe ou celui inclus dans Docker Compose

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/prophane/voltcraft.git
cd voltcraft
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

Éditer `.env` et remplir **au minimum** :
- `POSTGRES_PASSWORD` — mot de passe PostgreSQL fort
- `REDIS_PASSWORD` — mot de passe Redis fort
- `SESSION_SECRET` — 64 caractères hex aléatoires (`openssl rand -hex 32`)
- `ENCRYPTION_KEY` — 64 caractères hex aléatoires (`openssl rand -hex 32`)
- `TESLA_TOKEN` — bearer token Tesla Fleet API (optionnel au boot, peut être défini depuis l'UI)
- `TESLA_REGION` — `na`, `eu` ou `cn`

### 3. Démarrer

```bash
docker compose up -d
```

Si une variable requise manque, Docker Compose refusera maintenant de démarrer avec un message explicite. C'est volontaire: aucun secret par défaut n'est embarqué dans le dépôt.

Les services démarrent dans cet ordre : PostgreSQL → Redis → Mosquitto → API → Web.

### 4. Premier accès

1. Ouvrir [http://localhost:3000](http://localhost:3000)
2. L'application détecte qu'aucun compte n'existe et ouvre le formulaire de création
3. Créer le compte administrateur
4. Configurer la liaison Tesla depuis les Paramètres

> La configuration Tesla saisie dans l'UI est persistée dans le fichier `.env` local quand celui-ci est accessible en écriture.

---

## Ports locaux

| Service     | Port par défaut |
|-------------|-----------------|
| Web (UI)    | 3000            |
| API Fastify | 3001            |
| PostgreSQL   | 5432            |
| Redis       | 6379            |
| MQTT        | 1883            |

> Tous les ports sont liés sur `127.0.0.1` uniquement. La publication externe est gérée séparément par votre propre solution (ex: Pangolin, Cloudflare Tunnel, etc.).

---

## Documentation API

Swagger UI disponible en local sur :
```
http://localhost:3001/docs
```

---

## Structure du projet

```
voltcraft/
  apps/
    api/          — Backend Fastify (TypeScript strict)
    web/          — Frontend React + Vite
  packages/
    shared/       — Types, constantes, utilitaires communs
  infra/
    docker/       — Configs services Docker
  docker-compose.yml
  .env.example
```

---

## Développement local

### Installer les dépendances

```bash
# Requires pnpm
npm install -g pnpm
pnpm install
```

### Base de données

```bash
# Démarrer PostgreSQL et Redis uniquement
docker compose up db redis -d

# Générer le client Prisma
pnpm db:generate

# Appliquer les migrations
pnpm db:migrate
```

### Lancer en mode développement

```bash
# Terminal 1
pnpm dev:api

# Terminal 2
pnpm dev:web
```

---

## Tests

```bash
# Tous les tests
pnpm test

# API uniquement
pnpm --filter @voltcraft/api test

# Web uniquement
pnpm --filter @voltcraft/web test
```

---

## Mode Éco API Tesla

Voltcraft est conçu pour **minimiser les coûts** de la Tesla Fleet API (pay-per-use depuis janvier 2025) :

| Situation           | Intervalle de polling |
|---------------------|-----------------------|
| Véhicule en veille  | 10 min (mode éco)     |
| Véhicule en ligne   | 60 secondes           |
| En charge           | 30 secondes           |
| En route            | 60 secondes           |

Règles supplémentaires :
- **Pas de réveil implicite** — jamais de wake_up automatique sauf action utilisateur explicite
- **Cache Redis** — les données récentes sont servies depuis le cache
- **Lock anti-concurrent** — une seule sync à la fois par véhicule
- **Journal d'usage** — tous les appels Tesla sont loggés dans `api_usage_logs`

---

## Intégration Home Assistant

1. Démarrer le broker MQTT inclus ou configurer un broker externe dans `.env`
2. Activer MQTT dans les Paramètres de l'application
3. Voltcraft publie automatiquement les topics :
   - `voltcraft/<vin>/battery/level`
   - `voltcraft/<vin>/battery/range`
   - `voltcraft/<vin>/security/locked`
   - `voltcraft/<vin>/charge/state`
   - `voltcraft/<vin>/climate/inside_temp`
   - etc.
4. Home Assistant MQTT Discovery est supporté — les entités apparaissent automatiquement

---

## Variables d'environnement complètes

Voir [.env.example](.env.example) pour la liste complète documentée.

### Notes Tesla

- Le backend utilise `TESLA_TOKEN` + `TESLA_REGION`.
- En mode setup/UI, l'API `POST /api/settings/tesla` met à jour la configuration runtime et tente de persister ces valeurs dans `.env`.
- Après modification via UI en environnement Docker, un redémarrage du service API peut être nécessaire selon votre mode de déploiement.

---

## Feuille de route

- [ ] Multi-véhicules
- [ ] Exports CSV
- [ ] PWA complète (notifications push)
- [ ] Télémétrie temps réel
- [ ] Moteur de règles avancé
- [ ] Statistiques batterie approfondies
- [ ] Thèmes supplémentaires

---

## Licence

MIT — Usage personnel et familial. Ce projet n'est pas affilié à Tesla, Inc.
