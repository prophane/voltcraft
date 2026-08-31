# Notes de revue design — à retravailler plus tard

Document créé le 2026-09-01 pour garder une trace des observations sur le design actuel de l'app web, en vue d'une refonte future. Pas d'action immédiate requise, juste un état des lieux.

## 1. Système de design actuel (ce qui existe)

- **Thème** : dark mode uniquement (pas de light mode), fond quasi noir (`bg-base #0A0A0A`), cartes en `#141414`/`#1B1B1B`.
- **Accent** : rouge automobile `#E8112D` (référence Tesla), utilisé pour les liens actifs, boutons primaires, focus ring, halos ("glow").
- **Typo** : Inter (via Google Fonts CDN), plus des familles déclarées mais non utilisées (`Cal Sans` pour `font-display`, `JetBrains Mono`) — à vérifier si elles sont vraiment chargées quelque part.
- **Composants de base** : `Card`/`CardHeader`/`CardTitle` ([card.tsx](voltcraft/apps/web/src/components/ui/card.tsx)), `Badge`, `Button`, `Skeleton`. Classes utilitaires custom dans [globals.css](voltcraft/apps/web/src/styles/globals.css) (`.card`, `.btn-*`, `.badge-*`, `.stat-label`, `.stat-value`).
- **Navigation** : sidebar fixe desktop (`w-64`) + bottom nav mobile, personnalisables (ordre, icônes, visibilité) depuis Réglages.
- **Charts** : Recharts, un peu partout (dashboard, stats, vehicle-health), style et couleurs redéfinis à chaque endroit (pas de wrapper commun).

## 2. Problèmes concrets déjà identifiés

- **Graphiques à deux échelles très différentes tracés sur un seul axe Y** : bug réel trouvé sur le graphique "Évolution récente" (batterie % vs autonomie km) — corrigé le 2026-09-01, mais il faut vérifier si d'autres graphiques de l'app (stats, trips, charges) ont le même défaut (ex: courbes km + % + kWh combinées).
- **Labels d'axe X uniquement en heure (`HH:mm`)** sans date quand la série couvre plusieurs jours → lecture confuse, effet de "saut dans le temps". Corrigé pour la courbe batterie, à vérifier ailleurs (tire pressure trend utilise le même pattern `toLocaleTimeString` sans date, `tirePressureTrend` notamment).
- **Beaucoup de couleurs "en dur" répétées** dans le JSX plutôt que via les tokens Tailwind (`stroke="#8D8D8D"`, `#E8112D`, `#22c55e`...) au lieu de classes utilitaires ou variables CSS. Rend une recoloration globale ou un thème clair très coûteux à faire plus tard.
- **Pas de composant chart réutilisable** : chaque page réimplémente son propre `<AreaChart>`/`<BarChart>` avec sa propre grille, tooltip, dégradé. Beaucoup de duplication, risque d'incohérence visuelle (déjà observé : styles de tooltip légèrement différents d'une page à l'autre).
- **Densité d'information très inégale selon les pages** : certaines pages (Réglages) sont très denses en formulaires, d'autres (vehicle-health) mélangent gros score circulaire + petites tuiles de métriques + graphiques, sans grille de lecture homogène.

## 3. Pistes pour la refonte future

- Centraliser la palette de couleurs de charts dans un fichier unique (`chart-theme.ts`) réutilisé par tous les `Recharts`, plutôt que des couleurs hex dupliquées partout.
- Créer un composant `<TrendChart>` générique gérant : axes multiples, formattage de labels temporels (auto date+heure selon l'étendue), tooltip standard, légende.
- Revoir la hiérarchie visuelle des pages à forte densité (Réglages, Vehicle Health) — envisager des onglets ou un accordéon plutôt que tout empiler verticalement.
- Vérifier la cohérence des espacements (`p-5` vs `p-5 lg:p-6` vs `p-5 lg:p-7` utilisés de façon un peu ad hoc selon les sections).
- Décider si le mode clair doit être supporté un jour (`darkMode: 'class'` est configuré mais rien ne bascule le thème actuellement).
- Étendre l'audit à `apps/web/src/pages/stats`, `trips`, `charges`, `dashboard` pour repérer d'autres graphiques à double échelle ou labels temporels ambigus, sur le même modèle que le fix du 2026-09-01.

## 4. Historique des fixes déjà appliqués (contexte)

- 2026-09-01 : fix axe Y secondaire + labels date/heure sur le graphique "Évolution récente" de Vehicle Health ([vehicle-health.page.tsx](voltcraft/apps/web/src/pages/vehicle-health/vehicle-health.page.tsx)).
- 2026-09-01 : fix ancrage "capacité d'origine" (calcul sur tout l'historique au lieu de la fenêtre sélectionnée).
- 2026-09-01 : fix décalage d'index dans le drag-and-drop de réorganisation du menu (Réglages).
