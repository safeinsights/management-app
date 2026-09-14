import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import noRawStyleValues from './no-raw-style-values.mjs'

// RuleTester drives its own runner unless handed the framework's hooks; without this it asserts
// at import time and vitest reports the file as having no suite.
RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
})

ruleTester.run('noRawStyleValues', noRawStyleValues, {
    valid: [
        // Theme scale keys are the whole point of the migration.
        '<Stack p="md" mt="lg" gap="xs" />',
        '<Text c="dimmed" />',
        '<Box bg={semanticColor("surface.sunken")} />',
        '<Box c={semanticColor("text.primary")} />',
        '<Text fw={fontWeight.semibold} />',
        // Zero has no token and reads clearly as "none".
        '<Stack p={0} m={0} />',
        '<Stack p="0" />',
        // `auto` is CSS layout, not a spacing step.
        '<Box mx="auto" m="auto" />',
        // Mantine resolves a leading `-` against the same scale.
        '<Box mt="-md" ml="-xs" />',
        // A CSS variable reference is already a token lookup.
        '<Box bg="var(--si-color-surface-page)" />',
    ],
    invalid: [
        {
            code: '<Text c="charcoal.9" />',
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: '<Text c="grey.7" />',
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: '<Box bg="#f3f8fb" />',
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: '<Text fw={600} />',
            errors: [{ messageId: 'rawWeight' }],
        },
        {
            code: '<Text fw="bold" />',
            errors: [{ messageId: 'rawWeight' }],
        },
        {
            code: '<Stack p={16} />',
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: '<Box mt="-0.5rem" />',
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: '<Stack mt={24} gap={8} />',
            errors: [{ messageId: 'rawSpacing' }, { messageId: 'rawSpacing' }],
        },
        {
            code: '<div style={{ marginTop: 4 }} />',
            errors: [{ messageId: 'inlineStyle' }],
        },
        {
            code: '<Box style={{ color: "var(--si-color-text-primary)" }} />',
            errors: [{ messageId: 'inlineStyle' }],
        },
        {
            code: 'const c = "#ff0000"',
            errors: [{ messageId: 'hexLiteral' }],
        },
        {
            code: 'const gap = "12px"',
            errors: [{ messageId: 'pxLiteral' }],
        },
    ],
})
