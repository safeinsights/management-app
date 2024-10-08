# SafeInsights Management Application

The management app serves as an interface for researchers to submit and members to approve study proposals.

It’s responsible for:

-   Researcher creates/modifies/deletes study
-   Member is notified when a study proposal is submitted
-   Researcher is notified when study is approved
-   Member reviews/approves/denies study
-   Reports study status in response to enclave's SetupApp requests

# Development

For developing locally without docker compose, you will need to install postgresql and add a `.env` file that contains a valid DATABASE_URL to access it.

Otherwise you can use Docker compose to run the app and a postgresql database by using:

`docker compose up`

Other useful commands:

-   `docker compose build` will rebuild the docker image, needs to be ran after packages are installed
-   `docker compose exec mgmnt-app ./bin/migrate-dev-db` runs migrations
-   `docker volume rm management-app_pgdata` will delete the database, allowing it to be migrated freshly
