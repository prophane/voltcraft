# Demarrage rapide Voltcraft

Guide court pour demarrer rapidement. Pour la procedure complete d'exploitation et de production, voir [DEPLOYMENT.md](DEPLOYMENT.md).

## 1) Recuperer le projet

```bash
git clone https://github.com/prophane/voltcraft.git
cd voltcraft
cp .env.example .env
```

## 2) Completer le minimum dans `.env`

Valeurs obligatoires:
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`

Valeurs recommandees selon votre mode d'acces:
- `AUTH_DISABLED=true` si l'application est derriere un reverse proxy avec pre-authentification
- `TESLA_REDIRECT_URI` avec votre domaine public si vous utiliserez l'OAuth Tesla
- `TESLA_REGION` (`na`, `eu`, `cn`)

Si vous activez TeslaMate:
- `TESLAMATE_DB_PASSWORD`
- `TESLAMATE_ENCRYPTION_KEY`
- `TESLAMATE_GRAFANA_PASSWORD`

## 3) Demarrer la stack

Sans TeslaMate:

```bash
docker compose up -d
```

Avec TeslaMate:

```bash
docker compose --profile teslamate up -d
```

## 4) Ouvrir l'application

Par defaut:
- interface principale: `http://localhost:3000`
- API backend: `http://localhost:3001`
- healthcheck API: `http://localhost:3001/health`

## 5) Completer la configuration initiale

Si `AUTH_DISABLED=true`:
- l'assistant saute la creation de compte local
- il demande directement la configuration OAuth Tesla

Si `AUTH_DISABLED=false`:
- l'assistant cree un compte admin local
- puis demande la configuration OAuth Tesla

Vous pourrez ensuite retrouver la configuration Tesla dans la page Parametres.

## 6) Verification rapide

```bash
docker compose ps
docker compose logs --tail=200 api
```

Endpoints utiles:
- `GET /health`
- `GET /api/config`
- `GET /api/vehicle/current`
- `GET /api/vehicle/state`
- `GET /api/stats/summary?days=30`

UI utile a verifier rapidement:
- Dashboard: carte pression pneus (dernier echantillon)
- Sante Vehicule: bloc suivi pression pneus
- Trajets: heatmap ON/OFF persistee
- Mobile: barre basse 4 entrees + Plus

## 7) Mise a jour

Sans TeslaMate:

```bash
git pull
docker compose up -d --build
```

Avec TeslaMate:

```bash
git pull
docker compose --profile teslamate up -d --build
```

## 8) Si l'interface semble incoherente

1. Faire un hard refresh navigateur
2. Cliquer sur `Actualiser` dans le tableau de bord pour forcer une synchronisation vehicule
3. Verifier `docker compose logs --tail=200 api`
4. Verifier `GET /api/config`
5. Si TeslaMate est active, verifier la coherence des credentials TeslaMate
6. Consulter la section depannage de [DEPLOYMENT.md](DEPLOYMENT.md)
