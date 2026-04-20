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
✅ **Installe l'API backend Node.js (Fastify)** en service Windows `OliveAppAPI` (port 4000) avec auth JWT (signup/login), bcrypt, CRUD générique sur les tables whitelistées

❌ Ne déploie PAS les edge functions Supabase (`admin-users` etc. — à réécrire dans le backend Node)
❌ Pas de Realtime (utiliser polling ou ajouter un service WebSocket séparé)

**Pour basculer le frontend vers l'API backend Node locale** :
1. Éditez `.env.production` : `VITE_API_URL="http://localhost:4000"` (et commentez les `VITE_SUPABASE_*`)
2. Adaptez les appels Supabase JS → `fetch` REST direct sur `/api/:table` et `/auth/*`
3. Identifiants et `JWT_SECRET` dans `C:\OliveAppAPI\credentials.txt`

**Pour utiliser PostgREST à la place** :
1. `.env.production` : `VITE_API_URL="http://localhost:3000"`
2. Identifiants dans `C:\PostgREST\credentials.txt`

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
│   ├── 07-api-backend.ps1   # API Node.js Fastify + NSSM (service OliveAppAPI)
│   └── 99-uninstall.ps1     # Désinstalle (site IIS + DB + PostgREST)
├── api-backend/             # Sources de l'API Node.js (Fastify + JWT + pg)
│   ├── package.json
│   ├── src/server.js        # Auth + CRUD générique
│   └── sql/auth_tables.sql  # Table auth_users
├── config/
│   ├── web.config           # Réécriture SPA + compression
│   └── env.production.tpl   # Template .env (édité par 04-build)
└── sql/
    └── schema.sql           # Schéma complet (généré depuis migrations Supabase)
```

## API backend Node.js — utilisation

Une fois installé (étape 7/7), l'API tourne en service Windows automatique :

- **Endpoint** : `http://localhost:4000`
- **Health** : `http://localhost:4000/health`
- **Service** : `OliveAppAPI` (gérable via `services.msc`)
- **Sources** : `C:\OliveAppAPI\src\server.js`
- **Config** : `C:\OliveAppAPI\.env` (lecture admin uniquement)
- **Identifiants** (JWT secret, etc.) : `C:\OliveAppAPI\credentials.txt`
- **Logs** : `C:\OliveAppAPI\api.log` et `api.err.log`

Endpoints disponibles :
- `POST /auth/signup` `{ email, password, full_name? }` → `{ token, user }`
- `POST /auth/login` `{ email, password }` → `{ token, user }`
- `GET  /auth/me` (Bearer JWT)
- `GET/POST/PATCH/DELETE /api/:table[/:id]` (Bearer JWT)

Tester signup :
```bash
curl -X POST http://localhost:4000/auth/signup ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"password\":\"motdepasse123\"}"
```
Le **premier** utilisateur créé reçoit automatiquement le rôle `admin`.

Pour modifier la liste des tables exposées, éditez `ALLOWED_TABLES` dans
`C:\OliveAppAPI\src\server.js` puis redémarrez le service :
`Restart-Service OliveAppAPI`.

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
