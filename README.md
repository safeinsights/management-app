# SafeInsights application template.

This repository is a template to start applications from as well as the SafeInsights AIS standard (this file)

## Bootstrapping an application

-   Fork this repository andp pull from the fork
-   Update package.json with app name and adjust other fields as needed
-   From inside the new app's directory, run `./bin/bootstrap-from-app-template` this script will:
    -   sets a git remote named "template" which points to this repo
    -   Replaces this README.md file with an UPDATE ME message
    -   removes package-lock.json from .gitignore

## Updating applications to match templates

-   Run `./bin/update-app-from-template` which will:
    -   fetch from the 'template' remote above
    -   checkout the `./bin/apply-updates-from-template` script from template/main in order to get the latest commands
    -   runs `./bin/apply-updates-from-template` which will apply the update by merging them into the app code

## Application Infrastructure Standards (AIS)

SafeInsights applications will be:

-   Hosted on github in a separate repository and have github workflows triggered on every PR commit. Workflows should run the below checks at a minimum:
    -   sonarqube
    -   eslint and prettier
    -   Vitest
    -   Codecov and fail if coverage is not 100%
    -   For api apps, run open-api to generate bindings and ensure files do not change.
-   Use the Nextjs framework as a starting point as initialized by: “npx create-next-app@latest” (“@rc” for now)
    -   The default options will be selected, i.e. Typescript, ESLint, src directory and app router all enabled, but Tailwind and import alias customization disabled.
-   Have the following standard npm packages installed:
    -   vitest cdk-nextjs-standalone @clerk/nextjs aws-sdk
    -   Dev packages: tsx dotenv aws-cdk-lib prettier
-   Contain a LICENSE file with the AGPL license content
-   Eslint [shall be configured](templates/common/.eslintrc.json) to include “eslint:recommended” with the following additions. Some are semi-controversial but have served us well in other projects:
    -   semi-colons are only used [in the few situations](https://eslint.org/docs/latest/rules/semi#never) where they are required.
    -   4 space indent (also see below editorconfig). This makes code a bit more legible, while also making indentation a bit more painful to discourage deeply nested blocks.
-   Have an [.editorconfig](https://editorconfig.org) [file](templates/common/.editorconfig) with these defaults:
    -   4 space indent
    -   Unix line endings
    -   UTF charset
-   Tests should strive to use stuff that the user “sees” like text or ARIA roles (button/checkbox/etc) instead of attributes on elements (e.g. id or class). If id is required, add a "data-testId" attribute and [target that in the specs](https://playwright.dev/docs/locators#locate-by-test-id)
-   Github Workflows configured to:
    -   Deploy to a per-PR test environment.
    -   Staging will be automatically deployed to match the \`main\` branch upon PR merge.
    -   Production will be deployed whenever a release is tagged by an member of code-deployers group
    -   A slack message will be posted to an appropriate channel whenever one of the above deploys occur

### Applications that have a web user interface, the following packages will be installed:

-   React 19 (RC currently, release estimated this summer)
-   [mantine](ttps://github.com/safeinsights)
-   [vanilla-extract](https://vanilla-extract.style)
-   [testing-library](https://testing-library.com) react with happy-dom
    -   [react support](https://testing-library.com/docs/react-testing-library/intro/)
-   [Playwright](https://playwright.dev)
    -   [Playwright Lighthouse](https://github.com/abhinaba-ghosh/playwright-lighthouse)

They will have playwright and lighthouse tests enabled to run as part of the github workflow.

### Applications that have an API interface will:

-   Utilize routes that start with /api/\<version\>, ie: \`/api/v1/foo/bar\`
-   Use OpenAPI to document routes and generate bindings for them.
    -   [https://github.com/jellydn/next-swagger-doc](https://github.com/jellydn/next-swagger-doc)

#### When developing an application, the following directory layout will be utilized:

-   filenames shall use “[kebab case](https://www.theserverside.com/definition/Kebab-case)” all lowercase, with dashes for spaces.
-   Named exports are [preferred over default exports](https://dev.to/phuocng/avoid-using-default-exports-a1c)
-   Configuration files live at the root of the application, code is in `/src`
-   Isomorphic code (runs on both client & server) is in /src/lib
-   items that are only used by a single page should be colocated in the same directory as the page itself
-   React components that are shared between pages are stored in /src/components
-   Server only code is in /src/server
-   Pages will follow nextjs standard and live in /src/app
-   Unit testing files will be colocated beside their module. Ie a file that tests /src/lib/random.ts will be located in /src/lib/random.test.ts
-   Other tests such as playwright or accessibility checks will be in a top-level \`/tests\` directory

#### Deploying applications

 * As a general rule, SafeInsights uses Amazon Web Services (AWS) to host applications
 * Resources deployed to AWS will use uniform tagging strategy
    * Our shared Infrastructure as Code (IaC) library has a [addTags](https://github.com/safeinsights/iac/blob/main/lib/tags.ts) helper function to easily tag resources
