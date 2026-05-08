# Voltcraft

Voltcraft est une application web auto-hebergee pour piloter et suivre un vehicule Tesla avec une architecture locale, dockerisee, et orientee maitrise des appels Tesla Fleet API.

Tesla est une marque de Tesla, Inc. Voltcraft est un projet independant non affilie a Tesla.

## Objectif du projet

- Pilotage et supervision vehicule depuis une UI unique
- Historique trajets, charges et statistiques
- Integration TeslaMate possible en backend telemetry
- Integration MQTT/Home Assistant
- Deploiement local sans SaaS obligatoire

## Architecture

Services principaux (profil par defaut):
- web + api
- db (PostgreSQL)
- redis
- mqtt
- vehicle-command (proxy commandes signees)

Services optionnels (profil teslamate):
- teslamate
- teslamate-db
- teslamate-mqtt
- teslamate-grafana

Definition des services: [docker-compose.yml](docker-compose.yml)

## Documentation de deploiement

- Demarrage rapide: [QUICKSTART.md](QUICKSTART.md)
- Mode operatoire complet (prod, upgrade, rollback, diagnostic): [DEPLOYMENT.md](DEPLOYMENT.md)
- Variables d environnement: [.env.example](.env.example)

## Flux recommande

1. Copier [.env.example](.env.example) vers .env et remplir les secrets
2. Lancer la stack avec Docker Compose
3. Configurer OAuth Tesla depuis l UI
4. Si TeslaMate est active, verifier la coherence des credentials DB TeslaMate cote api et teslamate-db
5. Valider les endpoints metier et la sante des conteneurs

## Commandes utiles

Demarrage stack standard:

```bash
docker compose up -d
```

Demarrage avec TeslaMate:

```bash
docker compose --profile teslamate up -d
```

Mise a jour applicative:

```bash
git pull
docker compose --profile teslamate up -d --build
```

Etat des services:

```bash
docker compose --profile teslamate ps
docker compose --profile teslamate logs -f api
```

## Deploiement TeslaMate en backend

La partie TeslaMate est consideree optionnelle mais peut devenir la source prioritaire pour les pages historiques et etat cache.

Variables critiques:
- TESLAMATE_DB_HOST
- TESLAMATE_DB_PORT
- TESLAMATE_DB_NAME
- TESLAMATE_DB_USER
- TESLAMATE_DB_PASSWORD
- TESLAMATE_ENCRYPTION_KEY
- TESLAMATE_GRAFANA_PASSWORD

Attention importante:
- Si teslamate-db a deja ete initialisee, changer seulement le .env ne change pas le mot de passe interne PostgreSQL du volume existant.
- En cas de mismatch de mot de passe, API ne pourra pas lire TeslaMate.

La procedure de resolution est documentee dans [DEPLOYMENT.md](DEPLOYMENT.md).

## Developpement local

Installation:

```bash
pnpm install
```

Build API:

```bash
pnpm --filter @voltcraft/api build
```

Build Web:

```bash
pnpm --filter @voltcraft/web build
```

Tests API:

```bash
pnpm --filter @voltcraft/api test
```

## Etat actuel de la robustesse

- Les endpoints listes et syntheses tombent en mode de secours si TeslaMate est indisponible
- La route etat vehicule renvoie un snapshot cache si le vehicule est asleep/offline cote Tesla, pour eviter un blocage UI
- Un test unitaire couvre la persistance de configuration TeslaMate lors de la sauvegarde

## Exploitation

Pour la production, suivre en priorite [DEPLOYMENT.md](DEPLOYMENT.md), puis garder [QUICKSTART.md](QUICKSTART.md) comme memo court.

## Licence

Usage prive et auto-heberge. Adapter la section license selon vos besoins projet.
