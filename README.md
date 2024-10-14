# SafeInsights Management Application

### Overview

The management app (also called Basic Management App or BMA) serves as an interface for researchers to submit and members to approve study proposals.

It’s responsible for:

-   Researcher creates/modifies/deletes study
-   Member is notified when a study proposal is submitted
-   Researcher is notified when study is approved
-   Member reviews/approves/denies study
-   Reports study status in response to enclave's SetupApp requests

# Development

Note: For developing locally without docker compose, you will need to install postgresql and add a `.env` file that contains a valid DATABASE_URL to access it.

Set these two environment variables with your Clerk secrets:

```shell
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_....
export CLERK_SECRET_KEY=sk_test_....
```

And then you can use Docker compose to run the app and a postgresql database by using:

`docker compose up`

Other useful commands:

### Getting Started - Local Setup

For developing locally without docker compose, you will need to install postgresql and add a `.env` file that contains a valid DATABASE_URL to access it.

Otherwise you can use Docker compose to run the app and a postgresql database by using:

`docker compose up`

Other useful commands:

-   `docker compose build` will rebuild the docker image, needs to be ran after packages are installed
-   `docker compose exec mgmnt-app ./bin/migrate-dev-db` runs migrations
-   `docker volume rm management-app_pgdata` will delete the database, allowing it to be migrated freshly

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Inter, a custom Google Font.

### Enclave API Routes

-   Api routes are protected by an authorization header containing a JWT Bearer which is signed with a RSA private key held be the member. The public key is stored in the members record accessed at the admin page at /admin/members

To generate a public private key you can run:

```bash
openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:4096
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

### Learn More

To learn more about Next.js, take a look at the following resources:

-   [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
-   [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

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

### UI Framework (Mantine)

### Running Tests

### Currently Implemented

### TODOs
