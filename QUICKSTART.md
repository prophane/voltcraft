# Quick Start Voltcraft

Ce guide est la version courte. Pour la procedure complete de production, voir [DEPLOYMENT.md](DEPLOYMENT.md).

## 1) Preparation

```bash
git clone https://github.com/prophane/voltcraft.git
cd voltcraft
cp .env.example .env
```

Editer .env et definir au minimum:
- POSTGRES_PASSWORD
- REDIS_PASSWORD
- SESSION_SECRET
- ENCRYPTION_KEY
- TESLA_CLIENT_ID
- TESLA_CLIENT_SECRET
- TESLA_REDIRECT_URI
- TESLA_REGION

Si profil TeslaMate:
- TESLAMATE_DB_PASSWORD
- TESLAMATE_ENCRYPTION_KEY
- TESLAMATE_GRAFANA_PASSWORD

## 2) Demarrage

Sans TeslaMate:

```bash
docker compose up -d
```

Avec TeslaMate:

```bash
docker compose --profile teslamate up -d
```

## 3) Verification

```bash
docker compose --profile teslamate ps
docker compose --profile teslamate logs -f api
```

Endpoints a tester:
- /health
- /api/vehicle/current
- /api/stats/summary?days=30
- /api/vehicle/state

## 4) Mise a jour

```bash
git pull
docker compose --profile teslamate up -d --build
```

## 5) Si interface vide

1. Faire un hard refresh navigateur
2. Verifier les logs api
3. Verifier la coherence mot de passe TeslaMate DB entre .env et volume teslamate-db
4. Suivre la section depannage de [DEPLOYMENT.md](DEPLOYMENT.md)
5. Ouvrir la page /diagnostics pour verifier les statuts services et Fleet API
