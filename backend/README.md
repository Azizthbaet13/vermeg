# Backend PDF Gen (Spring Boot)

API Spring Boot pour stocker des templates HTML (header / body / footer) et générer un PDF A4 via Chromium (Playwright).

## Prérequis

- Java 17+
- Maven 3.9+
- MySQL 8 sur le port `3306`
- Accès réseau au premier lancement (Playwright télécharge Chromium)

## MySQL

La base `pdf_templates_db` est créée automatiquement si l’utilisateur a les droits (`createDatabaseIfNotExist=true`).

Variables d’environnement :

| Variable | Défaut | Description |
|----------|--------|-------------|
| `DB_USER` | `root` | Utilisateur MySQL |
| `DB_PASSWORD` | *(vide)* | Mot de passe MySQL (XAMPP = vide par défaut) |
| `CORS_ORIGIN_PATTERNS` | `http://localhost:*`, `http://127.0.0.1:*` | Origines CORS (n’importe quel port local) |

## Playwright / Chromium

Au démarrage, `Playwright.create()` installe Chromium s’il est absent, puis un bean singleton conserve `Playwright` + `Browser`. Chaque génération PDF ouvre uniquement un `BrowserContext` / `Page`.

Installation manuelle éventuelle :

```bash
mvn exec:java -e -Dexec.mainClass=com.microsoft.playwright.CLI -Dexec.args="install chromium"
```

## Lancer l’API

```bash
cd backend
mvn spring-boot:run
```

L’API écoute sur `http://localhost:8081` (le port `8080` est souvent pris par Oracle sur Windows).

Le frontend Angular (`ng serve`) proxy `/api` vers `http://localhost:8081`.

## Commandes Maven

```bash
mvn test
mvn spring-boot:run
```

## API

| Méthode | Chemin | Description |
|---------|--------|-------------|
| `POST` | `/api/templates` | Créer un template |
| `GET` | `/api/templates` | Lister (pagination `page`, `size`) |
| `GET` | `/api/templates/{id}` | Lire un template |
| `PUT` | `/api/templates/{id}` | Mettre à jour |
| `DELETE` | `/api/templates/{id}` | Supprimer |
| `POST` | `/api/templates/{id}/generate` | Générer un PDF (body JSON de données) |

Exemple de génération :

```bash
curl -X POST http://localhost:8081/api/templates/1/generate \
  -H "Content-Type: application/json" \
  -o document.pdf \
  -d "{\"clientName\":\"Mohamed\",\"articles\":[{\"label\":\"Support\",\"unitPrice\":250}]}"
```

## Rendu des tableaux

Le placeholder `{{table:id}}` n’est **pas** une boucle HTML. `TableRenderingService` le remplace par un `<table>` complet à partir de `parts.tables` (stocké en JSON dans `tablesSchemaJson`).

- Schéma introuvable → placeholder remplacé par une chaîne vide
- Données absentes ou liste vide → tableau avec en-têtes uniquement
- Types de colonnes : `text`, `number`, `currency`, `date`, `percentage`, `boolean` (type inconnu → `text`)
