// Every React Query key comes from src/lib/query-keys.ts (OTTER-974): a hand-written key that
// differs from its reader by a typo or a naming style invalidates nothing and leaves a stale view.
const KEY_FIRST_METHODS = new Set(['setQueryData', 'getQueryData', 'getQueryState', 'setQueriesData', 'getQueriesData'])

const propertyName = (property) => {
    if (property.computed) return null
    if (property.key.type === 'Identifier') return property.key.name
    if (property.key.type === 'Literal') return String(property.key.value)
    return null
}

const noQueryKeyLiterals = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Build React Query keys with the factories in src/lib/query-keys.ts',
            recommended: false,
        },
        schema: [],
        messages: {
            keyLiteral: 'Build query keys with queryKeys from @/lib/query-keys, not an array literal.',
        },
    },
    create(context) {
        const report = (node) => context.report({ node, messageId: 'keyLiteral' })

        return {
            Property(node) {
                if (propertyName(node) === 'queryKey' && node.value.type === 'ArrayExpression') report(node.value)
            },
            JSXAttribute(node) {
                const { value } = node
                if (
                    node.name.name === 'queryKey' &&
                    value?.type === 'JSXExpressionContainer' &&
                    value.expression.type === 'ArrayExpression'
                ) {
                    report(value.expression)
                }
            },
            CallExpression(node) {
                const { callee } = node
                if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') {
                    return
                }
                if (!KEY_FIRST_METHODS.has(callee.property.name)) return
                if (node.arguments[0]?.type === 'ArrayExpression') report(node.arguments[0])
            },
        }
    },
}

export default noQueryKeyLiterals
