# Changelog

All notable changes to Voltcraft are documented in this file.

---

## [Unreleased] — 2026-05-13

### Bug Fixes

#### Dashboard — affichage du nom de geofence à la dernière position connue
- La carte "Dernière position connue" affichait auparavant systématiquement une adresse OSM.
- Voltcraft vérifie maintenant si la position courante se trouve à l'intérieur d'une zone géographique (geofence) et affiche son nom en priorité, avec l'adresse OSM en fallback.
- Correction d'un import cassé (`@/lib/api` → `@/lib/api-client`) qui empêchait le build.

#### Vehicle Health — correction TypeScript sur le graphe TPMS
- Résolution de l'erreur TS2769 sur le formateur `Tooltip` de Recharts (cast `any`).

---

### New Features

#### Vehicle Health — graphe de tendance pression des pneus (TPMS)
- Nouveau graphe Recharts multi-courbes dans l'onglet Vehicle Health.
- Affiche la pression des 4 pneus (avant gauche / avant droit / arrière gauche / arrière droit) sur les 96 derniers relevés.
- Permet de détecter visuellement une fuite lente ou une dégradation progressive.

#### Setup — Tesla Fleet API optionnel
- Le wizard de setup ne bloque plus si Fleet API n'est pas configuré.
- L'étape Tesla affiche désormais un bouton **"Skip for now"** permettant de terminer l'installation sans compte Fleet.
- Les identifiants Fleet peuvent être renseignés ultérieurement depuis la page Settings.

#### Déploiement — TeslaMate optionnel
- Les services TeslaMate (base de données, MQTT, Grafana) sont maintenant regroupés sous le **profil Docker Compose `teslamate`**.
- Voltcraft peut démarrer sans TeslaMate local : `docker compose up -d` (sans profil).
- Pour démarrer avec TeslaMate intégré : `docker compose --profile teslamate up -d`.
- Il est également possible de pointer vers une **instance TeslaMate externe** en renseignant `TESLAMATE_DB_HOST` dans le `.env`.
- Les variables `TESLAMATE_DB_PASSWORD`, `TESLAMATE_ENCRYPTION_KEY` et `TESLAMATE_GRAFANA_PASSWORD` sont désormais optionnelles (valeur vide par défaut).

#### API — bootstrap automatique du véhicule depuis TeslaMate
- Lorsque Fleet API n'est pas configuré, Voltcraft tente de créer automatiquement le véhicule en lisant la table `cars` de la base TeslaMate.
- Un compte système `teslamate-bootstrap@voltcraft.local` est créé silencieusement si nécessaire.
- Cela permet d'avoir un véhicule opérationnel dans Voltcraft (trajets, charges, statistiques) **sans aucun accès à l'API Tesla officielle**.
- La fonction `withVehicleAutoBootstrap` accepte désormais un paramètre `userId` pour associer le véhicule bootstrapé à l'utilisateur connecté.

---

### Documentation

- **README.md** — restructuré avec les modes de déploiement (Fleet only / TeslaMate only / hybrid).
- **QUICKSTART.md** — guide mis à jour pour les trois modes, variables d'environnement optionnelles documentées.
- **DEPLOYMENT.md** — commandes Docker Compose pour chaque mode, section troubleshooting enrichie.

---

### Commits inclus

| Hash | Message |
|------|---------|
| `90b13e8` | docs: update runbooks for optional Fleet and TeslaMate modes |
| `2a3ec0a` | feat(api): bootstrap vehicle from teslamate when fleet unavailable |
| `787d509` | feat(setup): make Fleet optional and teslamate stack optional |
| `4ca1a4c` | fix(web): restore build after geofence and tpms trend updates |
| `4b3458f` | fix(web/dashboard): use geofence fallback for last known location |
