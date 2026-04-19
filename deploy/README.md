# Déploiement Windows — IIS + PostgreSQL

Package de déploiement pour héberger l'application sur un serveur Windows avec IIS (frontend) et PostgreSQL (base locale).

## ⚠️ Important — Lisez avant de lancer

Cette application utilise actuellement **Lovable Cloud (Supabase)** pour l'authentification, l'API REST/Realtime, les RLS et les edge functions.

Le script de déploiement fait :

✅ Installe les prérequis (Node 20, IIS, URL Rewrite, PostgreSQL 16)
✅ Crée une base PostgreSQL locale `oliveapp` avec le schéma complet (tables, enums, fonctions, triggers) en miroir du schéma Supabase
✅ Build le frontend Vite (TanStack Start SSR désactivé → SPA statique)
✅ Configure le site IIS avec `web.config` (réécriture SPA + compression + cache)
✅ **Installe PostgREST** + NSSM en service Windows → expose la base en API REST locale (port 3000) compatible Supabase REST
✅ Crée les rôles `authenticator` / `web_anon` / `authenticated` et configure JWT

❌ Ne migre PAS l'authentification (à remplacer par Keycloak / authelia / backend custom signant des JWT compatibles PostgREST)
❌ Ne déploie PAS les edge functions (`admin-users` etc. — à réécrire en route backend)
❌ PostgREST n'expose pas le Realtime Supabase (utiliser `LISTEN/NOTIFY` PostgreSQL ou ajouter un service séparé)

**Pour basculer le frontend vers PostgREST local** :
1. Éditez `.env.production` (généré par `04-build.ps1`) : commentez les lignes Supabase, activez `VITE_API_URL="http://localhost:3000"`
2. Adaptez les appels Supabase JS → `fetch` REST direct ou `postgrest-js`
3. Implémentez un service d'auth qui signe des JWT avec le secret généré (voir `C:\PostgREST\credentials.txt`)

---

## Prérequis

- Windows Server 2019/2022 ou Windows 10/11 Pro
- Droits administrateur
- Connexion Internet (pour télécharger Node, PostgreSQL, URL Rewrite)
- ~5 Go d'espace disque

## Lancement

1. Copiez le dossier complet du projet sur le serveur (ex : `C:\app-source`)
2. Ouvrez **PowerShell en Administrateur**
3. `cd C:\app-source\deploy`
4. Double-cliquez `install.bat` (ou : `.\install.bat`)

Le script vous demandera :
- Mot de passe `postgres` (superuser PostgreSQL)
- Mot de passe pour l'utilisateur applicatif `oliveapp_user`
- URL de l'API backend (laissez vide pour garder Supabase)
- Nom du site IIS (défaut `OliveApp`)
- Port HTTP IIS (défaut `8080`)

## Structure du package

```
deploy/
├── install.bat              # Point d'entrée (lance install.ps1 en admin)
├── install.ps1              # Orchestrateur principal
├── scripts/
│   ├── 01-prereqs.ps1       # IIS + URL Rewrite + Node 20
│   ├── 02-postgres.ps1      # Installe PostgreSQL 16 silencieusement
│   ├── 03-database.ps1      # Crée DB, user, applique le schéma
│   ├── 04-build.ps1         # npm ci + build Vite
│   ├── 05-iis-site.ps1      # Crée AppPool + Site + bindings
│   ├── 06-postgrest.ps1     # PostgREST + NSSM (service Windows)
│   └── 99-uninstall.ps1     # Désinstalle (site IIS + DB + PostgREST)
├── config/
│   ├── web.config           # Réécriture SPA + compression
│   └── env.production.tpl   # Template .env (édité par 04-build)
└── sql/
    └── schema.sql           # Schéma complet (généré depuis migrations Supabase)
```

## PostgREST — utilisation

Une fois installé (étape 6/6), PostgREST tourne en service Windows automatique :

- **Endpoint** : `http://localhost:3000`
- **Service Windows** : `PostgREST` (gérable via `services.msc` ou `nssm`)
- **Config** : `C:\PostgREST\postgrest.conf`
- **Identifiants** (JWT secret, mots de passe rôles) : `C:\PostgREST\credentials.txt` (lecture admin uniquement)
- **Logs** : `C:\PostgREST\postgrest.log` et `postgrest.err.log`

Tester : `curl http://localhost:3000/clients` (retourne `[]` si la table est vide et que `web_anon` a les droits SELECT).

Pour signer un JWT côté backend avec le secret stocké :
```js
import jwt from "jsonwebtoken";
const token = jwt.sign({ role: "authenticated", sub: userId }, JWT_SECRET, { expiresIn: "1h" });
// Puis : fetch("http://localhost:3000/clients", { headers: { Authorization: `Bearer ${token}` }})
```

## Désinstallation

`.\scripts\99-uninstall.ps1` — supprime le site IIS, l'AppPool et la base `oliveapp`.
PostgreSQL et IIS restent installés (utilisez "Programmes et fonctionnalités").

## Logs

Tous les scripts loguent dans `deploy\logs\install-YYYYMMDD-HHmmss.log`.

## Dépannage

| Problème | Solution |
|---|---|
| `iisreset` échoue | Lancer PowerShell en admin (clic droit → Exécuter en tant qu'admin) |
| Port 8080 déjà utilisé | Relancer en spécifiant un autre port |
| `psql` introuvable | Le script ajoute `C:\Program Files\PostgreSQL\16\bin` au PATH — redémarrez la console |
| Site IIS retourne 500.19 | URL Rewrite manquant — relancer `01-prereqs.ps1` |
| 404 sur les routes (deep link) | `web.config` manquant dans `wwwroot` — relancer `05-iis-site.ps1` |
