# StockApp — Gestion de Stock & Facturation

Application web complète pour la gestion d'inventaire et la facturation, avec devise FCFA.

## Lancement rapide (Docker)

**Prérequis :** Docker Desktop installé et en cours d'exécution.

```bash
cd StockApp
docker-compose up --build
```

- **Frontend :** http://localhost:5173
- **Backend API :** http://localhost:3000
- **PostgreSQL :** localhost:5432

**Compte par défaut :** `admin@example.com` / `admin123`

---

## Lancement sans Docker

### 1. PostgreSQL

Installez PostgreSQL et créez une base de données :

```sql
CREATE DATABASE stockapp;
CREATE USER stockapp WITH PASSWORD 'stockapp_password';
GRANT ALL PRIVILEGES ON DATABASE stockapp TO stockapp;
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # ajustez DATABASE_URL si besoin
npm install
npm run dev
```

Le backend démarre sur http://localhost:3000 et crée automatiquement les tables + un compte admin.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Le frontend démarre sur http://localhost:5173.

---

## Fonctionnalités

| Module | Description |
|--------|-------------|
| **Authentification** | JWT avec refresh token, 4 rôles |
| **Produits** | CRUD + SKU unique + catégories + archivage |
| **Stock** | Mouvements entrée/sortie/ajustement + alertes email |
| **Clients** | Annuaire clients & fournisseurs |
| **Devis** | Multi-lignes, PDF, conversion en facture |
| **Factures** | Numérotation séquentielle, déduction stock atomique, PDF |
| **Paiements** | Suivi paiements partiels/complets |
| **Tableau de bord** | KPIs, graphique 12 mois, alertes |
| **Rapports** | Export Excel (factures, stock, TVA, mouvements) |
| **Paramètres** | Données entreprise, gestion utilisateurs |

## Stack technique

- **Frontend :** React 18 + TypeScript + Tailwind CSS + Zustand
- **Backend :** Node.js + Express + TypeScript
- **Base de données :** PostgreSQL 15
- **PDF :** PDFKit
- **Export :** SheetJS (xlsx)
- **Auth :** JWT (access 1h + refresh 7j)

## Variables d'environnement backend

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL PostgreSQL |
| `JWT_SECRET` | Secret access token |
| `JWT_REFRESH_SECRET` | Secret refresh token |
| `SMTP_HOST` | Hôte SMTP pour alertes email |
| `SMTP_PORT` | Port SMTP (défaut: 587) |
| `SMTP_USER` | Utilisateur SMTP |
| `SMTP_PASS` | Mot de passe SMTP |
| `ADMIN_EMAIL` | Email de destination des alertes |
