# SafeInsights Management Application

### Overview

The management app (also called Basic Management App or BMA) serves as an interface for researchers to submit and members to approve study proposals.

It’s responsible for:

- Researcher creates/modifies/deletes study
- Member is notified when a study proposal is submitted
- Researcher is notified when study is approved
- Member reviews/approves/denies study
- Reports study status in response to enclave's SetupApp requests

# Development

Note: For developing locally without docker compose, you will need to install postgresql and add a `.env` file that contains a valid DATABASE_URL to access it.

Copy the .env.sample file to .env replacing the XXX strings with values obtained from your one of your teammates.

When testing you can either use the accounts from the .env file or you can signup for a Clerk account using either a authenticator app or [test email or phone number](https://clerk.com/docs/testing/test-emails-and-phones). Our testing phone numbers start with +15555550100 and must be unique for each user. If clerk says one is in use then increment the last digit and try a new one, i.e. +15555550101, 0102 etc. Using the testing contact info mean that no SMS or email is sent and `424242` can be used to authenticate.

You can use Docker compose to run the app and a postgresql database by using:

`docker compose up`

Other useful commands:

### Getting Started - Local Setup

For developing locally without docker compose, you will need to install postgresql and add a `.env` file that contains a valid DATABASE_URL to access it.

Otherwise, you can use Docker compose to run the app and a postgresql database by using:

`docker compose up`

Other useful commands:

- `docker compose build` will rebuild the docker image, needs to be run after packages are installed
- `docker compose exec mgmnt-app ./bin/migrate-dev-db` runs migrations (needs running `docker compose up` at same time)
- `docker volume rm management-app_pgdata` will delete the database, allowing it to be migrated freshly
- `docker compose down -v --rmi all` "reset switch" (e.g. on DB errors) this command stops and removes Docker containers, networks, volumes, and all images used by the Docker Compose services.

Open [http://localhost:4000](http://localhost:4000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Inter, a custom Google Font.

### Enclave API Routes

- Api routes are protected by an authorization header containing a JWT Bearer which is signed with an RSA private key held be the member. The public key is stored in the members record accessed at the admin page at /admin/members

To generate a public private key you can run:

```bash
openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:4096
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

### Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

### Useful Links

[https://dev.to/aws-builders/how-to-package-and-deploy-a-lambda-function-as-a-container-image-3d1a] How to package and deploy a Lambda function as a container image
[https://docs.aws.amazon.com/cdk/v2/guide/serverless_example.html] Tutorial: Create a serverless Hello World application

### Suggested Way of Deploying Lambda Functions (for future)

The new way to deploy is from the IaC repo, run:

```bash
./bin/deploy-lambda -p <AWS CLI profile> -c <management app dir> -a managementApp
```

### Troubleshooting/Notes

There are a few CLI applications to debug the API end endpoints:

- npx tsx bin/debug/fetch-runnable.ts -u https://pilot.safeinsights.org/ -m openstax -k <path to private key>
- npx tsx bin/debug/set-status.ts -o https://pilot.safeinsights.org -m openstax -k <path to private key> -s <status: RUNNING | ERRORED> -r <uuid of run>
- npx tsx bin/debug/upload-results.ts -o https://pilot.safeinsights.org -m openstax -k <path to private key> -r <uuid of run> -f <path to file to upload as results>

**Currently,** it is possible to upload results and then set status back to RUNNING to force the run to re-appear in the runnable api results and repeatedly upload files. while useful for testing, do not depend on that behavior: it's likely we'll not allow it in later versions.

### Testing with Playwright

To run playwright tests locally, you'll need to install playwright:

- `npm install`
- `npx playwright install`

And then run playwright: `npx playwright test --ui` to view status, or run `npx playwright test --headed` to interact with browser as it runs.

If there are failures, a trace file will be stored under the `./test-results` directory. For instance to view a failure with the researcher creating a study, you can run: `npx playwright show-trace ./test-results/researcher-create-study-app-researcher-creates-a-study-chromium/trace.zip`

If there are playwright failures on GitHub actions, the trace file will be stored under the "Artifacts" section of the code run. You can download the trace.zip and then run `npx playwright show-trace <path to download>` to view the failure details.

### UI Framework (Mantine)

### Running Tests

### Currently Implemented

### TODOs
