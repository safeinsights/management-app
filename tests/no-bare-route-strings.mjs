// custom-rules/no-bare-route-strings.mjs
const noBareRouteStrings = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow bare strings in route navigation - use Routes object instead',
            recommended: true,
        },
        schema: [],
        messages: {
            bareHrefString: 'Use Routes object instead of bare string for href. Import from "@/lib/routes".',
            bareRouterPush: 'Use Routes object instead of bare string in router.push(). Import from "@/lib/routes".',
            bareRouterReplace:
                'Use Routes object instead of bare string in router.replace(). Import from "@/lib/routes".',
        },
    },
    create(context) {
        /**
         * Check if a string value is an internal route (starts with /)
         * Excludes external URLs and hash links
         */
        function isInternalRoute(value) {
            return (
                typeof value === 'string' &&
                value.startsWith('/') &&
                !value.startsWith('//') && // Protocol-relative URLs
                !value.startsWith('http') // Full URLs
            )
        }

        /**
         * Check if a node is a literal string or template literal
         */
        function isLiteralString(node) {
            return node.type === 'Literal' && typeof node.value === 'string'
        }

        /**
         * Check if a node is a template literal
         */
        function isTemplateLiteral(node) {
            return node.type === 'TemplateLiteral'
        }

        /**
         * Extract the static parts of a template literal to check if it starts with /
         */
        function templateStartsWithSlash(node) {
            if (node.type !== 'TemplateLiteral') return false
            const firstQuasi = node.quasis[0]
            return firstQuasi && firstQuasi.value.raw.startsWith('/')
        }

        return {
            // Check href props in JSX
            'JSXAttribute[name.name="href"]'(node) {
                const value = node.value

                // Check for literal strings: href="/path"
                if (value && isLiteralString(value) && isInternalRoute(value.value)) {
                    context.report({
                        node: value,
                        messageId: 'bareHrefString',
                    })
                }

                // Check for JSX expression with literal: href={"/path"}
                if (
                    value &&
                    value.type === 'JSXExpressionContainer' &&
                    isLiteralString(value.expression) &&
                    isInternalRoute(value.expression.value)
                ) {
                    context.report({
                        node: value.expression,
                        messageId: 'bareHrefString',
                    })
                }

                // Check for JSX expression with template literal: href={`/path/${id}`}
                if (
                    value &&
                    value.type === 'JSXExpressionContainer' &&
                    isTemplateLiteral(value.expression) &&
                    templateStartsWithSlash(value.expression)
                ) {
                    context.report({
                        node: value.expression,
                        messageId: 'bareHrefString',
                    })
                }
            },

            // Check router.push() and router.replace() calls
            CallExpression(node) {
                if (
                    node.callee.type === 'MemberExpression' &&
                    node.callee.object.type === 'Identifier' &&
                    node.callee.object.name === 'router' &&
                    node.callee.property.type === 'Identifier'
                ) {
                    const methodName = node.callee.property.name
                    const arg = node.arguments[0]

                    // Check router.push() with bare string or template literal
                    if (methodName === 'push' && arg) {
                        if (isLiteralString(arg) && isInternalRoute(arg.value)) {
                            context.report({
                                node: arg,
                                messageId: 'bareRouterPush',
                            })
                        } else if (isTemplateLiteral(arg) && templateStartsWithSlash(arg)) {
                            context.report({
                                node: arg,
                                messageId: 'bareRouterPush',
                            })
                        }
                    }

                    // Check router.replace() with bare string or template literal
                    if (methodName === 'replace' && arg) {
                        if (isLiteralString(arg) && isInternalRoute(arg.value)) {
                            context.report({
                                node: arg,
                                messageId: 'bareRouterReplace',
                            })
                        } else if (isTemplateLiteral(arg) && templateStartsWithSlash(arg)) {
                            context.report({
                                node: arg,
                                messageId: 'bareRouterReplace',
                            })
                        }
                    }
                }
            },
        }
    },
}

export default noBareRouteStrings
