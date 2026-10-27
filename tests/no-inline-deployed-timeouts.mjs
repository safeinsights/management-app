// Every wait in tests/deployed is a named constant from tests/deployed/config.ts, so that the
// budget for a slow real environment is tuned in one place from measured runs. A number written
// where a wait is taken is the thing this rule refuses, along with the sleep that masks a race.
const noInlineDeployedTimeouts = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow numeric timeouts and sleeps in the deployed suite; use the constants in tests/deployed/config.ts',
            recommended: false,
        },
        schema: [],
        messages: {
            literalTimeout: 'Do not write a timeout inline here; name a constant from tests/deployed/config.ts.',
            sleep: 'Do not sleep; wait for the signal the test depends on (expect, toPass, waitForResponse).',
        },
    },
    create(context) {
        const isNumber = (node) =>
            (node?.type === 'Literal' && typeof node.value === 'number') ||
            (node?.type === 'UnaryExpression' &&
                node.argument?.type === 'Literal' &&
                typeof node.argument.value === 'number')

        return {
            // `{ timeout: 30_000 }`, wherever it is passed.
            Property(node) {
                const key = node.key.type === 'Identifier' ? node.key.name : node.key.value
                if (key === 'timeout' && isNumber(node.value)) {
                    context.report({ node: node.value, messageId: 'literalTimeout' })
                }
            },
            CallExpression(node) {
                if (node.callee.type !== 'MemberExpression' || node.callee.property.type !== 'Identifier') return
                const method = node.callee.property.name
                if (method === 'waitForTimeout') {
                    context.report({ node, messageId: 'sleep' })
                    return
                }
                // `test.setTimeout(60_000)`, `expect.configure({ timeout })` style calls with a bare number.
                if (method === 'setTimeout' && isNumber(node.arguments[0])) {
                    context.report({ node: node.arguments[0], messageId: 'literalTimeout' })
                }
            },
        }
    },
}

export default noInlineDeployedTimeouts
