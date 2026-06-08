# Kast Alldebrid — Addon Stremio

Kast Alldebrid est un addon Stremio configurable basé sur un index distant et l’utilisation d’une clé API AllDebrid personnelle.

L’addon n’héberge aucun média. Il affiche des catalogues dans Stremio et utilise la clé AllDebrid de chaque utilisateur pour résoudre les liens au moment de la lecture.

---

## Fonctionnement

L’addon utilise :

- un index distant commun pour les catalogues ;
- une clé API AllDebrid personnelle par utilisateur ;
- une clé TMDB personnelle pour les affiches et métadonnées ;
- une URL Stremio personnelle chiffrée pour chaque utilisateur.

Chaque utilisateur génère sa propre URL d’installation depuis la page de configuration.

---

## Utilisation avec l’addon hébergé

Ouvre la page de configuration de l’addon :

```txt
https://stremio-kast-addon.onrender.com/configure
```

Renseigne :

```txt
Clé API AllDebrid
TMDB Access Token v4 ou TMDB API Key v3
```

Clique ensuite sur :

```txt
Générer mon URL Stremio
```

L’addon va générer une URL personnelle du type :

```txt
https://stremio-kast-addon.onrender.com/u/cfg_xxxxx/manifest.json
```

Dans Stremio :

```txt
Addons → Add addon → colle l’URL générée → Install
```

---

## Important

Ne partage jamais ton URL personnelle.

Cette URL contient ta configuration chiffrée et permet d’utiliser ta clé AllDebrid.

Ne partage jamais :

```txt
ton URL /u/cfg_xxxxx/manifest.json
ta clé API AllDebrid
ton token TMDB
```

Si tu penses avoir partagé ton URL ou ta clé par erreur, régénère ta clé API AllDebrid depuis ton compte AllDebrid.

---

## Catalogues disponibles

Selon la configuration de l’index distant, plusieurs catalogues peuvent être disponibles :

```txt
Kast Movies
Kast Cartoons
Kast Series
Kast Cartoon Series
Kast Documentaires
Kast Docu Series
Kast Spectacles
Kast Concerts
```

Les catalogues sont basés sur un index commun géré à distance.

---

## Clé API AllDebrid

Chaque utilisateur doit utiliser sa propre clé API AllDebrid.

L’addon utilise cette clé uniquement pour résoudre les liens au moment de la lecture.

Ne mets jamais de clé AllDebrid globale dans une instance publique partagée.

---

## Clé TMDB

TMDB est utilisé pour enrichir les fiches médias :

```txt
affiches
fonds d’écran
descriptions
notes
durées
genres
```

Tu peux utiliser :

```txt
TMDB Access Token v4
```

ou :

```txt
TMDB API Key v3
```

Le token v4 est recommandé.

---

## Auto-hébergement

Cette section concerne uniquement les utilisateurs avancés qui veulent héberger leur propre instance.

Installation :

```bash
npm install
cp .env.example .env
npm start
```

Sur Windows PowerShell :

```powershell
npm install
copy .env.example .env
npm start
```

Si `.env.example` n’est pas présent, crée manuellement un fichier `.env` à la racine du projet.

---

## Exemple de configuration `.env`

```env
NODE_ENV=production
PUBLIC_MODE=true
HOST=0.0.0.0
PORT=7000

CONFIG_ENCRYPTION_SECRET=un_secret_long_et_aleatoire

REMOTE_CONFIG_URL=https://paste.lesalkodiques.com/raw/74ngq2T4
REMOTE_CONFIG_TTL_SECONDS=300

TMDB_LANGUAGE=fr-FR
TMDB_POSTER_SIZE=w500
TMDB_BACKDROP_SIZE=w1280

DEBUG_HEALTH=false
LOG_SENSITIVE_URLS=false

ALLOWED_REMOTE_HOSTS=paste.lesalkodiques.com,web.app,firebaseapp.com
MAX_REMOTE_BYTES=26214400

RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX=180
CACHE_TTL_SECONDS=600
EXPOSE_UNRESOLVED_STREAMS=false
```

Pour générer `CONFIG_ENCRYPTION_SECRET` :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Déploiement Render

Paramètres recommandés :

```txt
Runtime: Node
Build Command: npm install
Start Command: npm start
```

Variables d’environnement Render minimales :

```env
NODE_ENV=production
PUBLIC_MODE=true
HOST=0.0.0.0

CONFIG_ENCRYPTION_SECRET=un_secret_long_et_aleatoire

REMOTE_CONFIG_URL=https://paste.lesalkodiques.com/raw/74ngq2T4
REMOTE_CONFIG_TTL_SECONDS=300

DEBUG_HEALTH=false
LOG_SENSITIVE_URLS=false
```

Ne mets pas de clé AllDebrid personnelle dans Render pour une instance publique.

Chaque utilisateur doit renseigner sa propre clé via `/configure`.

---

## Sécurité

Le dépôt ne doit jamais contenir :

```txt
.env
config.local.json
node_modules/
logs/
*.log
```

Ces fichiers doivent rester locaux et être ignorés par Git.

---

## Avertissement

Cet addon n’héberge aucun fichier vidéo.

Il organise des catalogues et utilise les comptes personnels des utilisateurs pour résoudre les liens au moment de la lecture.
