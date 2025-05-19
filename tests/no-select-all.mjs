// custom-rules/no-select-all-without-args.js
export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow calling `selectAll()` without any arguments',
            recommended: false,
        },
        schema: [],
        messages: {
            missingArgs: '`selectAll()` must be called with at least one argument.',
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                let isSelectAll = false

                // property: foo.selectAll()
                if (
                    node.callee.type === 'MemberExpression' &&
                    !node.callee.computed &&
                    node.callee.property.type === 'Identifier' &&
                    node.callee.property.name === 'selectAll'
                ) {
                    isSelectAll = true
                }

                if (isSelectAll && node.arguments.length === 0) {
                    context.report({
                        node,
                        messageId: 'missingArgs',
                    })
                }
            },
        }
    },
}
