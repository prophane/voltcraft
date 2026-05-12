# Mode operatoire de deploiement Voltcraft

Ce document decrit la procedure de deploiement et d'exploitation de Voltcraft en environnement serveur, avec ou sans profil TeslaMate.

## 1. Prerequis

- Docker Engine + plugin Docker Compose
- Acces shell sur le serveur
- DNS / reverse proxy deja en place si exposition externe
- Git et acces au depot

## 2. Emplacement recommande

Exemple:

```bash
/opt/voltcraft
```

Fichiers importants:
- [docker-compose.yml](docker-compose.yml)
- [.env.example](.env.example)
- `.env` : secrets et configuration serveur

Volumes critiques:
- `voltcraft-db-data`
- `voltcraft-redis-data`
- `voltcraft-mqtt-data`
- `voltcraft-app-config`
- `teslamate-db-data`
- `teslamate-grafana-data`

Le volume `voltcraft-app-config` contient la configuration runtime persistee par l'application, notamment certaines mises a jour faites depuis l'interface Parametres Tesla.

## 3. Installation initiale

### 3.1 Recuperer le code

```bash
git clone https://github.com/prophane/voltcraft.git /opt/voltcraft
cd /opt/voltcraft
```

### 3.2 Creer `.env`

```bash
cp .env.example .env
```

Minimum obligatoire:
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`

Variables importantes selon votre architecture:
- `AUTH_DISABLED=true` si une pre-authentification est deja geree par votre reverse proxy
- `TESLA_REDIRECT_URI` avec votre domaine public
- `TESLA_REGION`
- `TESLA_COMMAND_PROXY_URL` si vous utilisez un proxy different du service compose par defaut

Si TeslaMate est active:
- `TESLAMATE_DB_PASSWORD`
- `TESLAMATE_ENCRYPTION_KEY`
- `TESLAMATE_GRAFANA_PASSWORD`

### 3.3 Demarrer les services

Stack standard:

```bash
docker compose up -d
```

Stack avec TeslaMate:

```bash
docker compose --profile teslamate up -d
```

### 3.4 Verifier l'etat initial

Sans TeslaMate:

```bash
docker compose ps
docker compose logs --tail=200 api
```

Avec TeslaMate:

```bash
docker compose --profile teslamate ps
docker compose --profile teslamate logs --tail=200 api
```

Validation minimale:
- `api` healthy
- `db` healthy
- `redis` healthy
- `vehicle-command` demarre
- pas d'erreur fatale repetee dans les logs API

## 4. Configuration applicative apres demarrage

### 4.1 Flux de setup

Si `AUTH_DISABLED=true`:
- pas de login local obligatoire
- l'assistant demande directement la configuration OAuth Tesla

Si `AUTH_DISABLED=false`:
- l'assistant cree un compte admin local
- puis demande la configuration OAuth Tesla

### 4.2 Configuration Tesla

La configuration Tesla peut etre faite:
- dans l'assistant initial
- ensuite dans l'interface Parametres

Le backend persiste la configuration dans `APP_CONFIG_PATH` (par defaut `/app/data/runtime.env`) a l'interieur du volume `voltcraft-app-config`.

### 4.3 Proxy de commandes Tesla

Le service `vehicle-command` est demarre par Docker Compose et utilise les fichiers generes dans le volume `app-config`.

Variables associees:
- `TESLA_COMMAND_PROXY_URL`
- `TESLA_REDIRECT_URI`
- `TESLA_CLIENT_ID`
- `TESLA_CLIENT_SECRET`

## 5. Procedure de mise a jour

Depuis `/opt/voltcraft`.

Sans TeslaMate:

```bash
git pull origin main
docker compose down
docker compose build --no-cache
docker compose up -d
```

Avec TeslaMate:

```bash
git pull origin main
docker compose --profile teslamate down
docker compose --profile teslamate build --no-cache
docker compose --profile teslamate up -d
```

Verifications post-mise a jour:

```bash
docker compose logs --tail=200 api
docker compose ps
```

Endpoints utiles a verifier:
- `GET /health`
- `GET /api/config`
- `GET /api/vehicle/current`
- `GET /api/vehicle/state`
- `GET /api/stats/summary?days=30`

## 6. Retour arriere rapide

Lister les derniers commits:

```bash
git log --oneline -n 10
```

Revenir a un commit stable:

```bash
git checkout <commit_stable>
docker compose up -d --build
```

Puis revenir sur `main` quand le correctif est pret:

```bash
git checkout main
git pull origin main
```

## 7. Sauvegardes

### 7.1 Backup logique PostgreSQL Voltcraft

```bash
docker exec -t voltcraft-db pg_dump -U voltcraft -d voltcraft > voltcraft.sql
```

### 7.2 Backup logique PostgreSQL TeslaMate

```bash
docker exec -t teslamate-db pg_dump -U teslamate -d teslamate > teslamate.sql
```

### 7.3 Sauvegarde de la configuration runtime

La configuration sauvegardee depuis l'UI est stockee dans le volume `voltcraft-app-config`. Il faut donc inclure ce volume dans votre strategie de backup si vous ne voulez pas perdre la configuration Tesla / TeslaMate persistee par l'application.

## 8. TeslaMate backend mode

### 8.1 Objectif

Permettre a Voltcraft de lire l'historique et certaines donnees telemetry depuis TeslaMate.

### 8.2 Conditions

- profil `teslamate` demarre
- `teslamate-db` accessible depuis `api`
- credentials `TESLAMATE_DB_*` coherents

### 8.3 Point critique sur le mot de passe TeslaMate

Si le volume `teslamate-db` existe deja, modifier seulement `.env` ne met pas automatiquement a jour le mot de passe PostgreSQL interne.

Symptome typique:
- erreurs d'authentification PostgreSQL dans les logs API

Resolution:
- remettre dans `.env` le mot de passe ayant servi a initialiser le volume
- ou recreer le volume TeslaMate si la perte d'historique est acceptable

## 9. Depannage cible

### 9.1 Dashboard vide ou incoherent

Verifier:
1. `GET /api/vehicle/current` repond `200`
2. `GET /api/vehicle/state` repond `200`
3. `GET /api/stats/summary?days=30` repond `200`
4. hard refresh navigateur
5. bouton `Actualiser` dans le tableau de bord
6. logs API sans erreur fatale

Si la telemetrie est presente mais la carte pneus est vide:
1. verifier `GET /api/vehicle/state` et la presence des champs `tpmsPressureFl`, `tpmsPressureFr`, `tpmsPressureRl`, `tpmsPressureRr`
2. verifier la source active (Tesla ou TeslaMate) et la disponibilite TPMS cote source

### 9.2 Etat vehicule stale ou incorrect

Actions:
1. cliquer `Actualiser` dans le tableau de bord
2. verifier `GET /api/vehicle/state`
3. verifier les logs API lors d'un sync manuel
4. si TeslaMate est active, verifier quelle source alimente l'etat observe

### 9.3 `Vehicle is offline or asleep`

Comportement parfois attendu quand Tesla refuse `vehicle_data`.

Mitigation actuelle:
- retour d'un snapshot cache cote API

### 9.4 MQTT en restart

```bash
docker compose logs --tail=200 mqtt
```

Causes frequentes:
- conf Mosquitto invalide
- port deja occupe
- probleme de volume/droits

### 9.5 Healthcheck API KO

Verifier:
- `DATABASE_URL`
- `REDIS_URL`
- generation Prisma / migrations
- acces a `vehicle-command` si commandes Tesla configurees

## 10. Checklist d'exploitation

Avant validation release:

1. Dashboard affiche bien la derniere pression pneus
2. Sante Vehicule affiche le suivi pression pneus
3. Trajets conserve le choix heatmap ON/OFF apres rechargement
4. Navigation mobile affiche 4 entrees visibles + Plus

Apres chaque deploiement:
1. conteneurs healthy
2. endpoints critiques en `200`
3. dashboard charge sans erreur JS bloquante
4. logs API sans erreur critique repetitive
5. configuration runtime preservee si attendue

## 11. Commandes utiles

Logs API:

```bash
docker compose logs -f api
```

Etat des conteneurs:

```bash
docker compose ps
```

Rebuild API uniquement:

```bash
docker compose up -d --build api
```

Rebuild complet:

```bash
docker compose up -d --build
```
