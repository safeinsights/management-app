# SafeInsights Management Application

## Overview

The management app (also called Basic Management App or BMA) serves as an interface for researchers to submit and reviewers to approve study proposals.

It's responsible for:

- Researcher creates/modifies/deletes study
- Reviewer is notified when a study proposal is submitted
- Researcher is notified when study is approved
- Reviewer reviews/approves/denies study
- Reports study status in response to enclave's SetupApp requests

## Requirements

### Production Environment

- Node.js version 20.x or higher
- PostgreSQL

### Development Environment

Either:

- **Option 1:** Node.js + Docker and Docker Compose (installs PostgreSQL in container)
- **Option 2:** Node.js + PostgreSQL installed locally

## Development

### Local Setup Options

#### Option 1: Using Docker Compose 🐳

You can use Docker compose to run the app and a PostgreSQL database:

```bash
docker compose up
```

Open [http://localhost:4000](http://localhost:4000) with your browser to access the app.

#### Option 2: Local Setup without Docker 💻

For developing locally without docker compose, you will need to:

1. Install PostgreSQL and add a `.env` file that contains a valid DATABASE_URL to access it. [Homebrew instructions](https://wiki.postgresql.org/wiki/Homebrew)

2. Install SeaweedFS: `brew install seaweedfs` and provision it using:
    - Start server: `./bin/local-seaweedfs`
    - Create bucket (_only needed once_): `./bin/local-createbucket`

3. Install dependencies:

    ```bash
    corepack enable
    pnpm install
    ```

4. Run the development server:
    ```bash
    pnpm run dev
    ```

## Roles and screens

- dashboard is located at: `/dashboard`
- Reviewers can access the review dashboard at: `/<org slug>/dashboard`
- There are two admin types and screens:
    - An organization admin is a member of an organization who can invite other users to that organization. Their admin screen is located at: `/admin/team/<org slug>`. From there they can administer the users in their organization.
    - An SI Staff admin is a user who belongs to the `safe-insights` organization (defined as `CLERK_ADMIN_ORG_SLUG` in the codebase). The screen at `/admin/safeinsights` allows administrating Organizations. SI Staff administrators are super-admins and can also visit the organization admin screens noted above.

## Type-Safe Routing 🗺️

The application uses a type-safe routing system located in [src/lib/routes](src/lib/routes) that provides compile-time and runtime validation for routes and parameters using Zod schemas. All routes must be defined in the `Routes` object in [src/lib/routes](src/lib/routes) and accessed using it's type safe methods as shown below:

**Usage example:**

```tsx
import { Routes, useTypedParams } from '@/lib/routes'

// Build type-safe routes
const route = Routes.studyView({ orgSlug: 'acme', studyId: '123' })

// Use type-safe params in components
const params = useTypedParams(Routes.studyView.schema)
// params.orgSlug and params.studyId are guaranteed to be valid
```

### Creating Your Admin Account 🔐

To develop locally, you'll need to create your own SI Staff admin account:

1. Copy the `.env.sample` file to `.env`, replacing the XXX strings with values obtained from your teammates. This will set up the app with a sandbox Clerk backend. Your `.env` file MUST have valid `CLERK_SECRET_KEY` and `DATABASE_URL` values (get values from teammates)

2. Run the admin user creation script:

    ```bash
    pnpm run create-admin-user
    ```

    Or if using Docker (with `docker compose up` running):

    ```bash
    docker compose exec mgmnt-app pnpm run create-admin-user
    ```

3. Follow the interactive prompts to enter your email, password, and name

4. Sign in at [http://localhost:4000](http://localhost:4000) with your new credentials

**Note:** This creates an SI Staff admin with full access to administer all organizations.

### Useful Docker Commands 🐋

- `docker compose build` - Rebuild the docker image (needed after packages are installed)
- `docker compose exec mgmnt-app ./bin/migrate-dev-db` - Run migrations (needs running `docker compose up` at same time)
- `docker volume rm management-app_pgdata` - Delete the database, allowing it to be migrated freshly
- `docker compose down -v` - Gentler "reset switch" that stops and removes containers, networks, volumes, but keeps images
- `docker compose down -v --rmi all` - Full "reset switch" for DB errors (stops and removes Docker containers, networks, volumes, and all images)
- `docker system prune -a` or `docker builder prune` - Clear your docker cache in case of emergency

### Database Management 🗄️

- `pnpm exec kysely migrate:make your_migration_name` - Creates a migration file, we should use `snake_case` for migration names
- `pnpm run db:migrate` - Run database migrations
- `pnpm exec kysely migrate:down -1` - Rollback the last applied migration

### Database Visualization with DBGate 📊

When running the application using `docker compose up`, a DBGate instance is also started. DBGate provides a web-based interface for visualizing and interacting with the PostgreSQL database used by the application.

You can access DBGate in your browser at: [http://localhost:3000](http://localhost:3000)

The connection details for the development database (`mgmnt_dev`) are pre-configured.

## Enclave API Routes 🔒

API routes are protected by an authorization header containing a JWT Bearer which is signed with an RSA private key held by the organization. The public key is stored in the organization admin panel.

To generate a public/private key pair you can run:

```bash
openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:4096
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

## Component Explorer (Ladle) 🧩

We use [Ladle](https://ladle.dev) to develop and preview UI in isolation — design-system primitives, page
layouts, modals, and auth/MFA flows — without running the full app, a session, or a database. Stories live
next to their components as `*.stories.tsx`; the Ladle config and the Vite shims that let app components
render outside Next.js live under [`.ladle/`](.ladle/).

### Develop

```bash
pnpm ladle        # starts the explorer (default http://localhost:61000) with hot reload
```

### Build a shareable, offline copy

To hand someone a self-contained copy they can open with no server and no install:

```bash
pnpm ladle:build:standalone   # → .ladle/dist-standalone/index.html
```

This produces a single (~2 MB) `index.html` with all JS/CSS inlined and no code-split chunks, so it opens
from a plain `file://` double-click. A normal Ladle build can't do this — it emits ES-module scripts and
lazy-loaded chunks that browsers block over `file://`. Zip it to share:

```bash
( cd .ladle/dist-standalone && zip -r ../dist-standalone.zip index.html favicon-*.svg touch-icon-*.png manifest-*.webmanifest )
# → .ladle/dist-standalone.zip — recipient unzips and double-clicks index.html
```

The brand font (Open Sans) still loads from Google Fonts, so fully offline it falls back to a system
sans-serif; everything else is embedded.

### Build for static hosting

```bash
pnpm ladle:build   # → .ladle/dist/ (code-split; serve over HTTP, e.g. `pnpm dlx serve .ladle/dist`)
```

## Testing

### Unit Testing

```bash
pnpm run test:unit
```

### E2E Testing with Playwright 🎭

To run playwright tests locally, you'll need to install playwright:

- `pnpm install`
- `pnpm exec playwright install`

And then run playwright: `pnpm exec playwright test --ui` to view status, or run `pnpm exec playwright test --headed` to interact with browser as it runs.

If there are failures, a trace file will be stored under the `./test-results` directory. For instance to view a failure with the researcher creating a study, you can run: `pnpm exec playwright show-trace ./test-results/researcher-create-study-app-researcher-creates-a-study-chromium/trace.zip`

If there are playwright failures on GitHub actions, the trace file will be stored under the "Artifacts" section of the code run. You can download the trace.zip and then run `pnpm exec playwright show-trace <path to download>` to view the failure details.

### trivy vulnerability scanner

To run trivy locally, you'll need to install it. For mac that would be e.g. `brew install trivy`

And then run it to get report back on your terminal

```bash
trivy fs --config trivy.yaml --format table .
```

## Deployment 🚀

### Suggested Way of Deploying Lambda Functions (for future)

The new way to deploy is from the IaC repo, run:

```bash
./bin/deploy-lambda -p <AWS CLI profile> -c <management app dir> -a managementApp
```

## Troubleshooting/Notes 🛠️

There are a few CLI applications to debug the API end endpoints:

```bash
pnpm exec tsx bin/debug/fetch-runnable.ts -u http://localhost:4000 -o openstax -k <path to private key>
pnpm exec tsx bin/debug/set-status.ts -u http://localhost:4000 -o openstax -k <path to private key> -s <status: JOB-PROVISIONING | JOB-RUNNING | JOB-ERRORED> -j <uuid of job>
pnpm exec tsx bin/debug/upload-results.ts -u http://localhost:4000 -o openstax -k <path to private key> -j <uuid of job> -r <path to file to upload as results> -l <path of file to upload as logs>
pnpm exec tsx bin/debug/keys.ts -u http://localhost:4000 -o openstax -k <path to private key> -j <uuid of job>
```

The scripts will use default values tailored for local development:

- origin will default to http://localhost:4000
- organization to `openstax`
- key to `tests/support/private_key.pem` (local dev `openstax` defaults to using the public key pair of this)

Examples:

- view runnable jobs details (useful for obtaining job uuids): `pnpm exec tsx bin/debug/fetch-runnable.ts`
- set a job as running: `pnpm exec tsx bin/debug/set-status.ts -s JOB-RUNNING -j <job uuid>`
- upload results: `pnpm exec tsx bin/debug/set-status.ts -f tests/assets/results-with-pii.csv -j <job uuid>`

**Currently,** it is possible to upload results and then set status back to RUNNING to force the run to re-appear in the runnable api results and repeatedly upload files. While useful for testing, do not depend on that behavior: it's likely we'll not allow it in later versions.

## Resources 📚

- [phosphor icons](https://phosphoricons.com/)
- [mantine](https://mantine.dev)
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [How to package and deploy a Lambda function as a container image](https://dev.to/aws-builders/how-to-package-and-deploy-a-lambda-function-as-a-container-image-3d1a)
- [Tutorial: Create a serverless Hello World application](https://docs.aws.amazon.com/cdk/v2/guide/serverless_example.html)

## License

This application is released under the [GNU Affero General Public License v3.0](LICENSE). It bundles third-party components covered by separate licenses, including LGPL-3.0-or-later code (`libvips`, transitively via `sharp`). See [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) for the complete list, source-availability information, and notes on how to exercise LGPL rights against the distributed image.
