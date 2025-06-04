# SafeInsights Management App Project Conventions

This document outlines the coding conventions and best practices used in this project.

## Code Style

- **Indentation:**
  Use spaces for indentation with an indent size of 4.
- **Line Endings:**
  Use LF (Unix style).
- **Max Line Length:**
  Limit lines to 120 characters.
- **Whitespace:**
  Trim trailing whitespace and enforce a final newline.

## Linting and Formatting

- The project uses ESLint and Prettier to ensure consistent code style.
- Use the following npm scripts:
  - `npm run lint` - Check for lint issues.
  - `npm run lint:fix` - Automatically fix lint issues.
- Also run `npm run checks` to run type checking and linting together.

## Type Checking

- TypeScript is used for static type checking.
- Use `npm run typecheck` to run the TypeScript compiler for validation.

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
