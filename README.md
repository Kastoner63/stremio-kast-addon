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

### Catalogues « Années »

Chaque catalogue classique dispose d'une vue supplémentaire « Années ». Le manifeste déclare ainsi **16 catalogues au total** (8 classiques + 8 par année) :

```txt
Kast Movies - Années
Kast Cartoons - Années
Kast Series - Années
Kast Cartoon Series - Années
Kast Documentaires - Années
Kast Docu Series - Années
Kast Spectacles - Années
Kast Concerts - Années
```

Le contenu affiché dépend des médias présents dans l'index distant.

### Filtrer par genre

Dans **Stremio → Découvrir**, sélectionne **Films** ou **Séries**, puis un catalogue classique (par exemple **Kast Movies** ou **Kast Series**).

Le sélecteur de genre propose notamment **Action**, **Comédie**, **Drame**, **Horreur**, **Mystère** et **Thriller**. Le filtre utilise les identifiants de genres TMDb présents dans la colonne `GENRES` des sources. La recherche et la pagination restent disponibles dans les catalogues classiques.

### Filtrer par année

Dans **Stremio → Découvrir**, choisis **Films** ou **Séries**, puis le catalogue **Kast Movies - Années**, **Kast Series - Années** ou une autre vue « Années ».

Sélectionne une année dans le menu proposé : en **2026**, les 28 choix vont de **2000 à 2027** (la plage glisse automatiquement avec l'année courante). Les résultats sont filtrés sur la colonne `YEAR`, avant pagination.

**À noter :** dans certaines versions de Stremio, le menu des années reste intitulé **« Genre »**, car les vues « Années » réutilisent le sélecteur natif de catalogue. Le filtrage **Genre** et le filtrage **Année** utilisent donc des **catalogues distincts** : ils ne sont pas combinés dans un seul sélecteur.

### Mettre à jour l'addon dans Stremio

Après une modification des catalogues ou des filtres dans le manifeste, il peut être nécessaire de **désinstaller puis réinstaller** Kast Alldebrid depuis **Addons → Mes addons**, en utilisant **la même URL personnelle de manifeste** qu'auparavant. Cette opération ne supprime pas la configuration du serveur.

Ne partage jamais cette URL personnelle : elle contient ta configuration chiffrée.

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

## Avertissement

Cet addon n’héberge aucun fichier vidéo.

Il organise des catalogues et utilise les comptes personnels des utilisateurs pour résoudre les liens au moment de la lecture.
