// Every React Query key comes from src/lib/query-keys.ts (OTTER-974): a hand-written key that
// differs from its reader by a typo or a naming style invalidates nothing and leaves a stale view.
const KEY_FIRST_METHODS = new Set(['setQueryData', 'getQueryData', 'getQueryState', 'setQueriesData', 'getQueriesData'])

const propertyName = (property) => {
    if (property.computed) return null
    if (property.key.type === 'Identifier') return property.key.name
    if (property.key.type === 'Literal') return String(property.key.value)
    return null
}

const TS_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion'])

// The array literals a key expression evaluates to, seen through `as const`, `satisfies` and `a ? b : c`.
const keyLiterals = (node) => {
    if (!node) return []
    if (TS_WRAPPERS.has(node.type)) return keyLiterals(node.expression)
    if (node.type === 'ConditionalExpression') return [...keyLiterals(node.consequent), ...keyLiterals(node.alternate)]
    return node.type === 'ArrayExpression' ? [node] : []
}

// The key literals inside the arrays an `invalidates: () => [...]` function returns.
const returnedKeyLiterals = (fn) => {
    if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') return []
    const returned =
        fn.body.type === 'BlockStatement'
            ? fn.body.body.filter((statement) => statement.type === 'ReturnStatement').map((r) => r.argument)
            : [fn.body]
    return returned.flatMap(keyLiterals).flatMap((keys) => keys.elements.flatMap(keyLiterals))
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
                const name = propertyName(node)
                if (name === 'queryKey') keyLiterals(node.value).forEach(report)
                if (name === 'invalidates') returnedKeyLiterals(node.value).forEach(report)
            },
            JSXAttribute(node) {
                const { value } = node
                if (node.name.name === 'queryKey' && value?.type === 'JSXExpressionContainer') {
                    keyLiterals(value.expression).forEach(report)
                }
            },
            CallExpression(node) {
                const { callee } = node
                if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') {
                    return
                }
                if (!KEY_FIRST_METHODS.has(callee.property.name)) return
                keyLiterals(node.arguments[0]).forEach(report)
            },
        }
    },
}

export default noQueryKeyLiterals
