# Kast Alldebrid — Addon Stremio

Kast Alldebrid est un addon Stremio configurable basé sur un index distant et l’utilisation d’une clé API AllDebrid personnelle.

L’addon n’héberge aucun média. Il affiche des catalogues dans Stremio et utilise la clé AllDebrid de chaque utilisateur pour résoudre les liens au moment de la lecture.

---

## Fonctionnement

L’addon utilise :

* un index distant commun pour les catalogues ;
* une clé API AllDebrid personnelle par utilisateur ;
* une clé TMDB personnelle pour les affiches et métadonnées ;
* une URL Stremio personnelle chiffrée pour chaque utilisateur.

Chaque utilisateur génère sa propre URL d’installation depuis la page de configuration.

---

## Utilisation de l’addon hébergé

Ouvre la page de configuration de l’addon :

```txt
https://kast-addon-pi.tail47625d.ts.net/configure
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
https://kast-addon-pi.tail47625d.ts.net/u/cfg_xxxxx/manifest.json
```

Dans Stremio :

```txt
Addons → Add addon → colle l’URL générée → Install
```

Au premier lancement, les catalogues peuvent prendre quelques secondes à apparaître. C’est normal, le temps que l’addon charge l’index distant et prépare les catalogues.

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

Lien utile :

```txt
https://alldebrid.com/apikeys/
```

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

Lien utile :

```txt
https://www.themoviedb.org/settings/api
```

---

## Hébergement actuel

L’addon est actuellement hébergé sur un Raspberry Pi personnel avec Tailscale Funnel.

Architecture :

```txt
Utilisateur Stremio
↓
URL HTTPS Tailscale Funnel
↓
Raspberry Pi
↓
Addon Node.js en local sur 127.0.0.1:7000
```

Cette configuration permet :

```txt
aucun port ouvert sur la box Internet
pas d’exposition directe de l’IP publique
HTTPS via Tailscale Funnel
addon lancé en local sur le Raspberry
processus maintenu avec PM2
```

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
HOST=127.0.0.1
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

ADMIN_TOKEN=un_token_admin_long
```

Pour générer `CONFIG_ENCRYPTION_SECRET` ou `ADMIN_TOKEN` :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Lancer l’addon avec PM2 sur Raspberry Pi

Installer PM2 :

```bash
sudo npm install -g pm2
```

Lancer l’addon :

```bash
cd ~/stremio-kast-addon
pm2 start src/server.js --name kast-alldebrid
pm2 save
```

Voir l’état :

```bash
pm2 status
```

Voir les logs :

```bash
pm2 logs kast-alldebrid
```

Redémarrer après modification :

```bash
pm2 restart kast-alldebrid --update-env
pm2 save
```

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

Configuration recommandée pour un hébergement sécurisé :

```env
HOST=127.0.0.1
PUBLIC_MODE=true
DEBUG_HEALTH=false
LOG_SENSITIVE_URLS=false
EXPOSE_UNRESOLVED_STREAMS=false
ADMIN_TOKEN=un_token_admin_long
```

À ne pas faire :

```txt
ouvrir le port 7000 sur la box
mettre HOST=0.0.0.0 sur un serveur maison exposé directement
publier une clé API AllDebrid globale
partager une URL /u/cfg_xxxxx personnelle
publier le fichier .env
```

---

## Déploiement Render optionnel

L’addon peut aussi être déployé sur Render.

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

## Avertissement

Cet addon n’héberge aucun fichier vidéo.

Il organise des catalogues et utilise les comptes personnels des utilisateurs pour résoudre les liens au moment de la lecture.
