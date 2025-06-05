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

2. Install minio and minio-mc [Homebrew instructions](https://min.io/docs/minio/macos/index.html) and provision it using:

    - Start server: `./bin/local-minio`
    - Setup alias (_only needed once_): `mc alias set siminio http://localhost:9198 si-local-minio si-local-minio`
    - Create bucket (_only needed once_): `mc mb siminio/mgmt-app-local`

3. Install dependencies:

    ```bash
    npm install
    ```

4. Run the development server:
    ```bash
    npm run dev
    ```

## Roles and screens

- Researcher dashboard is located at: `/researcher/dashboard`
- Reviewers can access the review dashboard at: `/reviewer/<org slug>/dashboard`
- There are two admin types and screens:
    - A organization admin is a member of an organization who can invite other users to that organization. Their admin screen is located at: `/admin/team/<org slug>` From their they can administer the users in their organization.
    - A SI Staff admin is an user who belongs to the `safe-insights` organization (defined as `CLERK_ADMIN_ORG_SLUG` in codebase). The screen at `/admin/safeinisghts` allows administrating Organizations. SI Staff administrators are super-admins and can also visit the organization admin screens noted above.

### Authentication Configuration 🔐

You can configure test accounts in one of two ways:

1. **Recommended**: Copy the `.env.sample` file to `.env`, replacing the XXX strings with values obtained from your teammates. This will set up the app with a sandbox Clerk backend, and provide credentials for test users. When testing, copy the `E2E_CLERK_<ACCOUNT_TYPE>_EMAIL` and `...PASSWORD` values to log in as one of the test users. Use `424242` for MFA.

2. **Workaround**: Sign up for a Clerk account using either an authenticator app or [test email or phone number](https://clerk.com/docs/testing/test-emails-and-phones). Our testing phone numbers start with +15555550100 and must be unique for each user. If clerk says one is in use then increment the last digit and try a new one, i.e. +15555550101, 0102 etc. Using the testing contact info means that no SMS or email is sent and `424242` can be used to authenticate.

### Useful Docker Commands 🐋

- `docker compose build` - Rebuild the docker image (needed after packages are installed)
- `docker compose exec mgmnt-app ./bin/migrate-dev-db` - Run migrations (needs running `docker compose up` at same time)
- `docker volume rm management-app_pgdata` - Delete the database, allowing it to be migrated freshly
- `docker compose down -v` - Gentler "reset switch" that stops and removes containers, networks, volumes but keeps images
- `docker compose down -v --rmi all` - Full "reset switch" for DB errors (stops and removes Docker containers, networks, volumes, and all images)
- `docker system prune -a` or `docker builder prune` - Clear your docker cache in case of emergency

### Database Management 🗄️

- `npx kysely migrate:make your_migration_name` - Creates a migration file, we should use `snake_case` for migration names
- `npm run db:migrate` - Run database migrations

### Database Visualization with DBGate 📊

When running the application using `docker compose up`, a DBGate instance is also started. DBGate provides a web-based interface for visualizing and interacting with the PostgreSQL database used by the application.

You can access DBGate in your browser at: [http://localhost:3000](http://localhost:3000)

The connection details for the development database (`mgmnt_dev`) are pre-configured.

## Enclave API Routes 🔒

API routes are protected by an authorization header containing a JWT Bearer which is signed with an RSA private key held by the organization. The public key is stored in the organization admin panel.

To generate a public private key you can run:

```bash
openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:4096
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

## Testing

### Unit Testing

```bash
npm run test:unit
```

### E2E Testing with Playwright 🎭

To run playwright tests locally, you'll need to install playwright:

- `npm install`
- `npx playwright install`

And then run playwright: `npx playwright test --ui` to view status, or run `npx playwright test --headed` to interact with browser as it runs.

If there are failures, a trace file will be stored under the `./test-results` directory. For instance to view a failure with the researcher creating a study, you can run: `npx playwright show-trace ./test-results/researcher-create-study-app-researcher-creates-a-study-chromium/trace.zip`

If there are playwright failures on GitHub actions, the trace file will be stored under the "Artifacts" section of the code run. You can download the trace.zip and then run `npx playwright show-trace <path to download>` to view the failure details.

## Deployment 🚀

### Suggested Way of Deploying Lambda Functions (for future)

The new way to deploy is from the IaC repo, run:

```bash
./bin/deploy-lambda -p <AWS CLI profile> -c <management app dir> -a managementApp
```

## Troubleshooting/Notes 🛠️

There are a few CLI applications to debug the API end endpoints:

```bash
npx tsx bin/debug/fetch-runnable.ts -u http://localhost:4000 -o openstax -k <path to private key>
npx tsx bin/debug/set-status.ts -u http://localhost:4000 -o openstax -k <path to private key> -s <status: JOB-PROVISIONING | JOB-RUNNING | JOB-ERRORED> -j <uuid of job>
npx tsx bin/debug/upload-results.ts -u http://localhost:4000 -o openstax -k <path to private key> -j <uuid of job> -f <path to file to upload as results>
npx tsx bin/debug/keys.ts -u http://localhost:4000 -o openstax -k <path to private key> -j <uuid of job>
```

The scripts will use default values tailored for local development:

- origin will default to http://localhost:4000
- organization to `openstax`
- key to `tests/support/private_key.pem` (local dev `openstax` defaults to using the public key pair of this)

Examples:

- view runnable jobs details (useful for obtaining job uuids): `npx tsx bin/debug/fetch-runnable.ts`
- set a job as running: `npx tsx bin/debug/set-status.ts -s JOB-RUNNING -j <job uuid>`
- upload results: `npx tsx bin/debug/set-status.ts -f tests/assets/results-with-pii.csv -j <job uuid>`

**Currently,** it is possible to upload results and then set status back to RUNNING to force the run to re-appear in the runnable api results and repeatedly upload files. While useful for testing, do not depend on that behavior: it's likely we'll not allow it in later versions.

## Resources 📚

- [phosphor icons](https://phosphoricons.com/)
- [mantine](https://mantine.dev)
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [How to package and deploy a Lambda function as a container image](https://dev.to/aws-builders/how-to-package-and-deploy-a-lambda-function-as-a-container-image-3d1a)
- [Tutorial: Create a serverless Hello World application](https://docs.aws.amazon.com/cdk/v2/guide/serverless_example.html)
