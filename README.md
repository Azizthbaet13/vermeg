# Projectvermeg1

Éditeur Angular de templates HTML/PDF, branché sur une API **Spring Boot** (`backend/`).

## Lancer le projet (frontend + backend)

1. **MySQL 8** sur le port `3306` (utilisateur `root`, mot de passe vide par défaut XAMPP). La base `pdf_templates_db` est créée au démarrage.

2. **API Spring Boot** (port **8081**) :

```bash
cd backend
mvn spring-boot:run
```

3. **Frontend Angular** (proxy `/api` → `http://localhost:8081`) :

```bash
cd frontend
npm install
npm start
```

Ouvrez `http://localhost:4200/`.

| Action UI | API |
|-----------|-----|
| Sauvegarder / Mettre à jour | `POST` / `PUT /api/templates` |
| Liste « En base » | `GET /api/templates` |
| Générer le PDF | enregistre d’abord le template, puis `POST /api/templates/{id}/generate` (Playwright / Chromium) |

Détail backend : [backend/README.md](backend/README.md).

## Development server (Angular seul)

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files. The PDF backend is required for **Sauvegarder** and **Générer le PDF**.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
