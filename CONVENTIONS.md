# SafeInsights Management App Project Conventions

This document outlines the coding conventions and best practices used in this project.

## Code Style

- **Indentation:**
  Use spaces for indentation with an indent size of 4.
- **Line Endings:**
  Use LF (Unix style).
  Do not use semicolons
- **Max Line Length:**
  Limit lines to 120 characters.
- **Whitespace:**
  Trim trailing whitespace and enforce a final newline.
- Use `@/` import alias for all `src/` imports
- Import React Query from `@/common` only
- Never use hardcoded route strings; use `Routes.*` from `src/lib/routes`
- Unit tests go next to source files with `.test.ts(x)` suffix
- Don't mock database in unit tests; test actual records exist
- After any code change: run `npm run lint:fix && npm run test:unit`

## Linting and Formatting

- The project uses ESLint and Prettier to ensure consistent code style.
- Use the following npm scripts:
    - `npm run lint` - Check for lint issues.
    - `npm run lint:fix` - Automatically fix lint issues.
- Also run `npm run checks` to run type checking and linting together.

After making code changes, always run `npm run pre:push` to correct code structure before committing it

## Type Checking

- TypeScript is used for static type checking.
- Use `npm run typecheck` to run the TypeScript compiler for validation.

## Unit Testing

Run `npm run test:unit` to test all changes

When creating or modifying unit tests:

- unit tests use vitest, import it and other helper methods from '@/tests/unit.helpers.ts'
- create unit tests in the same directory as the component being tested, with the same filename but with a .test.t(x) suffix
- do not mock database when writing unit tests. Do not test db calls are performed, instead test the records exist in the db
- do not mock clerk or NextJS methods, they are mocked already
- do not test for the appearance of every single UI element, instead only test for critical functionality such as button clicks update state.
- do not cleanup mocks or other state.

## Git Hooks

- The project runs pre-commit and pre-push linting and type checks:
    - `pre:commit` - Runs linting and type checking before committing.
    - `pre:push` - Runs linting and type checking before pushing.

## Dependencies and Scripts

- The package dependencies and scripts in `package.json` serve as the backbone for building and validating the project.
- Ensure any new dependencies follow the existing conventions.

## Best Practices

- Always adhere to the established coding conventions for consistency.
- Utilize existing libraries and frameworks as provided.
- Keep code maintainable and well-documented.
