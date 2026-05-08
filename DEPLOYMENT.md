# Mode operatoire de deploiement Voltcraft

Ce document decrit une procedure deploiement exploitable en production, avec ou sans profil TeslaMate.

## 1. Prerequis

- Docker Engine + Docker Compose plugin
- Acces shell sur le serveur
- DNS/reverse proxy deja en place si exposition externe
- Repository clone sur le serveur

## 2. Arborescence cible

Exemple:

```bash
/opt/voltcraft
```

Fichiers cle:
- [docker-compose.yml](docker-compose.yml)
- [.env.example](.env.example)
- .env (local serveur, non versionne)

## 3. Installation initiale

### 3.1 Recuperer le code

```bash
git clone https://github.com/prophane/voltcraft.git /opt/voltcraft
cd /opt/voltcraft
```

### 3.2 Creer la config environnement

```bash
cp .env.example .env
```

Renseigner les secrets obligatoires:
- POSTGRES_PASSWORD
- REDIS_PASSWORD
- SESSION_SECRET
- ENCRYPTION_KEY
- TESLA_CLIENT_ID
- TESLA_CLIENT_SECRET
- TESLA_REDIRECT_URI
- TESLA_REGION

Si TeslaMate active:
- TESLAMATE_DB_PASSWORD
- TESLAMATE_ENCRYPTION_KEY
- TESLAMATE_GRAFANA_PASSWORD

### 3.3 Demarrer les services

Stack standard:

```bash
docker compose up -d
```

Stack avec TeslaMate:

```bash
docker compose --profile teslamate up -d
```

### 3.4 Verifier l etat

```bash
docker compose --profile teslamate ps
docker compose --profile teslamate logs --tail=200 api
```

Validation minimale:
- api en healthy
- db et redis en healthy
- pas d erreur fatale bouclee dans logs api

## 4. Procedure de mise a jour

Depuis /opt/voltcraft:

```bash
git pull
docker compose --profile teslamate up -d --build
```

Checks post-update:

```bash
docker compose --profile teslamate ps
docker compose --profile teslamate logs --tail=200 api
```

Endpoints a verifier:
- GET /health
- GET /api/vehicle/current
- GET /api/stats/summary?days=30
- GET /api/vehicle/state

## 5. Rollback rapide

Lister commits recents:

```bash
git log --oneline -n 10
```

Revenir au commit precedent stable:

```bash
git checkout <commit_stable>
docker compose --profile teslamate up -d --build
```

Ensuite, si necessaire, creer une branche hotfix pour corriger avant retour sur main.

Retour sur main apres rollback temporaire:

```bash
git checkout main
git pull
```

## 6. Sauvegarde et restauration

### 6.1 Volumes critiques

- voltcraft-db-data
- voltcraft-redis-data
- teslamate-db-data
- teslamate-grafana-data
- voltcraft-app-config

### 6.2 Backup logique PostgreSQL (Voltcraft)

```bash
docker exec -t voltcraft-db pg_dump -U voltcraft -d voltcraft > voltcraft.sql
```

### 6.3 Backup logique PostgreSQL (TeslaMate)

```bash
docker exec -t teslamate-db pg_dump -U teslamate -d teslamate > teslamate.sql
```

## 7. TeslaMate backend mode

### 7.1 Objectif

Permettre a Voltcraft de lire les donnees historiques/etat depuis TeslaMate en backend.

### 7.2 Conditions de fonctionnement

- profil teslamate demarre
- teslamate-db accessible depuis api
- credentials TESLAMATE_DB_* coherents

### 7.3 Point critique: mot de passe PostgreSQL TeslaMate

Si le volume teslamate-db existe deja, modifier .env ne met pas a jour automatiquement le mot de passe interne PostgreSQL.

Symptome typique:
- erreurs auth PostgreSQL dans logs api pour utilisateur teslamate

Resolution:
- soit remettre dans .env le mot de passe qui a servi a initialiser le volume
- soit reinitialiser/recreer le volume teslamate-db si perte historique acceptable

## 8. Depannage cible

### 8.1 Dashboard vide ou No data

Verifier:
1. GET /api/vehicle/current repond 200
2. GET /api/stats/summary?days=30 repond 200
3. GET /api/vehicle/state repond 200
4. hard refresh navigateur
5. logs api sans erreurs fatales

### 8.2 /api/vehicle/state retourne 502 Vehicle is offline or asleep

Comportement attendu possible quand Tesla refuse vehicle_data sur voiture asleep.

Mitigation en place:
- fallback snapshot cache cote api pour eviter blocage complet UI

Si visible encore frequemment:
- verifier presence de snapshots en base
- verifier coherence des routes avec la version deployee

### 8.3 Container voltcraft-mqtt en restart

Commandes:

```bash
docker compose logs --tail=200 mqtt
```

Points frequents:
- conf mosquitto invalide
- droits volume
- port deja occupe

### 8.4 Healthcheck API ko

Verifier:
- DATABASE_URL resolvable
- REDIS_URL resolvable
- migrations Prisma appliquees

## 9. Checklist exploitation

Apres chaque deploiement:
1. Services healthy
2. Endpoints metier en 200
3. Dashboard charge sans erreurs JS
4. Logs api sans erreur critique repetitive
5. Sauvegarde planifiee confirmee

## 10. Commandes d exploitation utiles

Logs API en continu:

```bash
docker compose --profile teslamate logs -f api
```

Etat des conteneurs:

```bash
docker compose --profile teslamate ps
```

Redemarrage API uniquement:

```bash
docker compose --profile teslamate up -d --build api
```

Redemarrage complet:

```bash
docker compose --profile teslamate up -d --build
```
