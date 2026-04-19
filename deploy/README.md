# Déploiement Windows — IIS + PostgreSQL

Package de déploiement pour héberger l'application sur un serveur Windows avec IIS (frontend) et PostgreSQL (base locale).

## ⚠️ Important — Lisez avant de lancer

Cette application utilise actuellement **Lovable Cloud (Supabase)** pour l'authentification, l'API REST/Realtime, les RLS et les edge functions.

Ce script **ne remplace pas Supabase**. Il fait :

✅ Installe les prérequis (Node 20, IIS, URL Rewrite, PostgreSQL 16)
✅ Crée une base PostgreSQL locale `oliveapp` avec le schéma complet (tables, enums, fonctions, triggers) en miroir du schéma Supabase
✅ Build le frontend Vite (TanStack Start SSR désactivé → SPA statique)
✅ Configure le site IIS avec `web.config` (réécriture SPA + compression + cache)

❌ Ne fournit PAS d'API REST locale (PostgREST, Hasura ou backend Node à brancher manuellement)
❌ Ne migre PAS l'authentification (à remplacer par Keycloak / authelia / backend custom)
❌ Ne déploie PAS les edge functions (`admin-users` etc.)

**Pour un vrai déploiement 100 % local**, vous devez ensuite :
1. Installer **PostgREST** (https://postgrest.org) pointé vers `oliveapp` pour exposer une API REST compatible Supabase, OU écrire un backend Node/Express
2. Remplacer l'auth Supabase par votre solution (JWT signé compatible PostgREST)
3. Réécrire les edge functions en routes backend

Le script génère un fichier `.env.production` que vous éditez avant le build pour pointer vers votre future API.

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
│   └── 99-uninstall.ps1     # Désinstalle (site IIS + DB seulement)
├── config/
│   ├── web.config           # Réécriture SPA + compression
│   └── env.production.tpl   # Template .env (édité par 04-build)
└── sql/
    └── schema.sql           # Schéma complet (généré depuis migrations Supabase)
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
