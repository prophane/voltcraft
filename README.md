# Voltcraft

Voltcraft est une application web auto-hebergee pour piloter, superviser et historiser un vehicule Tesla avec une architecture locale et dockerisee. L'application privilegie la maitrise des appels Tesla Fleet API, le cache intelligent et l'exploitation locale sans SaaS obligatoire.

Tesla est une marque de Tesla, Inc. Voltcraft est un projet independant et non affilie a Tesla.

## Ce que fait Voltcraft

- Tableau de bord temps reel avec etat compose du vehicule
- Commandes vehicule via Tesla Fleet API et proxy `vehicle-command`
- Historique trajets, charges, statistiques et diagnostics
- Support optionnel de TeslaMate comme backend telemetry/historique
- Integration MQTT / Home Assistant
- Mode `AUTH_DISABLED` pour reverse proxy avec pre-authentification amont

## Architecture actuelle

Services principaux:
- `api` : backend Fastify qui sert aussi l'application web
- `db` : PostgreSQL principal Voltcraft
- `redis` : cache / coordination / BullMQ
- `mqtt` : broker Mosquitto pour integrations MQTT
- `vehicle-command` : proxy Tesla pour commandes signees

Services optionnels sous profil `teslamate`:
- `teslamate`
- `teslamate-db`
- `teslamate-mqtt`
- `teslamate-grafana`

Definition complete des services: [docker-compose.yml](D:/voltcraft/docker-compose.yml)

## Flux recommande

1. Copier [.env.example](D:/voltcraft/.env.example) vers `.env`
2. Renseigner les secrets de base et les ports souhaites
3. Lancer la stack Docker Compose
4. Ouvrir Voltcraft dans le navigateur
5. Completer l'assistant initial ou la page Parametres Tesla pour configurer l'OAuth Tesla
6. Si TeslaMate est active, verifier la connectivite TeslaMate depuis l'UI Parametres

## Configuration Tesla

Voltcraft supporte aujourd'hui une configuration Tesla basee sur OAuth applicatif.

Deux modes existent:
- `AUTH_DISABLED=true` : l'assistant initial saute la creation du compte admin et demande uniquement la configuration OAuth Tesla
- `AUTH_DISABLED=false` : l'assistant cree d'abord un compte admin local, puis demande la configuration OAuth Tesla

La configuration Tesla peut etre mise a jour depuis l'interface dans Parametres. Le backend la persiste dans un fichier runtime (`APP_CONFIG_PATH`, par defaut `/app/data/runtime.env`) monte dans le volume `voltcraft-app-config`.

Champs Tesla principaux:
- `TESLA_CLIENT_ID`
- `TESLA_CLIENT_SECRET`
- `TESLA_REDIRECT_URI`
- `TESLA_REGION`
- `TESLA_COMMAND_PROXY_URL`

## Documentation disponible

- Demarrage rapide: [QUICKSTART.md](D:/voltcraft/QUICKSTART.md)
- Procedure d'exploitation et de deploiement: [DEPLOYMENT.md](D:/voltcraft/DEPLOYMENT.md)
- Variables d'environnement: [.env.example](D:/voltcraft/.env.example)

## Commandes utiles

Demarrage standard:

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
docker compose up -d --build
```

Mise a jour applicative avec TeslaMate:

```bash
git pull
docker compose --profile teslamate up -d --build
```

Etat et logs:

```bash
docker compose ps
docker compose logs -f api
```

## Developpement local

Installation:

```bash
pnpm install
```

Build du package shared:

```bash
pnpm --filter @voltcraft/shared build
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

## Robustesse actuelle

- La route d'etat vehicule peut renvoyer un snapshot cache si Tesla refuse `vehicle_data` sur une voiture asleep/offline
- Le dashboard propose un bouton `Actualiser` pour forcer une synchronisation immediate
- L'etat compose du vehicule est derive de la telemetrie fraiche cote UI
- Les pages historiques peuvent utiliser TeslaMate quand il est configure et disponible

## Exploitation

Pour un deploiement serveur, suivre d'abord [DEPLOYMENT.md](D:/voltcraft/DEPLOYMENT.md). Pour un rappel rapide une fois l'installation comprise, garder [QUICKSTART.md](D:/voltcraft/QUICKSTART.md).
