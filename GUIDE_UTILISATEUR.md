# Guide utilisateur - Kast Alldebrid

## Ce qu'il faut avant de commencer

Tu dois avoir :

1. Un compte AllDebrid avec une clé API personnelle.
2. Une clé TMDB ou un Access Token TMDB pour afficher les posters et descriptions.
3. Stremio installé.

## Installation de l'addon

1. Ouvre la page fournie par l'administrateur, par exemple :

```txt
https://ton-addon.onrender.com/configure
```

2. Remplis le formulaire :

```txt
Clé API AllDebrid : obligatoire
TMDB Access Token v4 : recommandé
TMDB API Key v3 : alternative au token v4
Langue TMDB : fr-FR
Agent AllDebrid : KastStremioAddon
```

3. Clique sur :

```txt
Générer mon URL Stremio
```

4. Copie l'URL générée. Elle ressemble à :

```txt
https://ton-addon.onrender.com/u/cfg_xxxxx/manifest.json
```

5. Dans Stremio :

```txt
Addons → Add addon → colle l'URL → Install
```

## Important

Ne partage jamais ton URL personnelle. Elle contient ta configuration chiffrée et permet d'utiliser ta clé AllDebrid.

Ne partage jamais ta clé API AllDebrid ou TMDB.

## Si aucun média ne s'affiche

Vérifie que l'addon a bien été installé avec l'URL personnelle `/u/cfg_xxxxx/manifest.json`, et non avec `/manifest.json`.

## Si les sources ne se lancent pas

Vérifie que ta clé AllDebrid est valide et que le fichier est disponible sur AllDebrid.
