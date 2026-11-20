// Writes declare the keys they change with useMutation({ invalidates }) (OTTER-974), so the
// refresh lives next to the write and cannot be forgotten in one caller of it.
const noDirectInvalidation = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Refresh queries through useMutation({ invalidates }), not by calling invalidateQueries',
            recommended: false,
        },
        schema: [],
        messages: {
            directInvalidation:
                'Declare the keys a write changes with useMutation({ invalidates }) instead of calling invalidateQueries.',
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                const { callee } = node
                if (
                    callee.type === 'MemberExpression' &&
                    !callee.computed &&
                    callee.property.type === 'Identifier' &&
                    callee.property.name === 'invalidateQueries'
                ) {
                    context.report({ node, messageId: 'directInvalidation' })
                }
            },
        }
    },
}

export default noDirectInvalidation
