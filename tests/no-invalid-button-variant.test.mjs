import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'
import noInvalidButtonVariant from './no-invalid-button-variant.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
})

ruleTester.run('noInvalidButtonVariant', noInvalidButtonVariant, {
    valid: [
        '<Button variant="filled" />',
        '<Button variant="error" />',
        '<Button variant={confirmVariant} />',
        '<StatusAlert variant="warning" />',
    ],
    invalid: [
        { code: '<Button variant="primary" />', errors: [{ messageId: 'unknownVariant' }] },
        { code: '<ActionIcon variant={"danger"} />', errors: [{ messageId: 'unknownVariant' }] },
    ],
})
