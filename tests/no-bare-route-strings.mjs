// custom-rules/no-bare-route-strings.mjs
const ROUTE_CALLEES = new Set(['redirect', 'permanentRedirect', 'revalidatePath'])

const noBareRouteStrings = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow bare strings in route navigation and revalidation - use Routes object instead',
            recommended: true,
        },
        schema: [],
        messages: {
            bareHrefString: 'Use Routes object instead of bare string for href. Import from "@/lib/routes".',
            bareRouterPush: 'Use Routes object instead of bare string in router.push(). Import from "@/lib/routes".',
            bareRouterReplace:
                'Use Routes object instead of bare string in router.replace(). Import from "@/lib/routes".',
            bareCallString: 'Use Routes object instead of bare string in {{callee}}(). Import from "@/lib/routes".',
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
         * Extract the static parts of a template literal to check if it starts with /
         */
        function templateStartsWithSlash(node) {
            if (node.type !== 'TemplateLiteral') return false
            const firstQuasi = node.quasis[0]
            return Boolean(firstQuasi) && isInternalRoute(firstQuasi.value.raw)
        }

        // `'/x' as Route` is how typedRoutes is satisfied, so a cast must not hide the string.
        const TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'])

        function unwrapTypeAssertions(node) {
            while (node && TYPE_WRAPPERS.has(node.type)) node = node.expression
            return node
        }

        /** The string node to report, or null when the argument is not a bare internal route. */
        function bareRouteNode(arg) {
            const node = unwrapTypeAssertions(arg)
            if (!node) return null
            if (isLiteralString(node) && isInternalRoute(node.value)) return node
            if (templateStartsWithSlash(node)) return node
            return null
        }

        return {
            // Check href props in JSX: href="/path", href={"/path"} and href={`/path/${id}`}
            'JSXAttribute[name.name="href"]'(node) {
                const value = node.value
                const route = bareRouteNode(value?.type === 'JSXExpressionContainer' ? value.expression : value)

                if (route) {
                    context.report({ node: route, messageId: 'bareHrefString' })
                }
            },

            // Check redirect(), permanentRedirect(), revalidatePath(), router.push() and router.replace() calls
            CallExpression(node) {
                const route = bareRouteNode(node.arguments[0])
                if (!route) return

                if (node.callee.type === 'Identifier' && ROUTE_CALLEES.has(node.callee.name)) {
                    context.report({ node: route, messageId: 'bareCallString', data: { callee: node.callee.name } })
                }

                if (
                    node.callee.type === 'MemberExpression' &&
                    node.callee.object.type === 'Identifier' &&
                    node.callee.object.name === 'router' &&
                    node.callee.property.type === 'Identifier'
                ) {
                    const methodName = node.callee.property.name

                    if (methodName === 'push') {
                        context.report({ node: route, messageId: 'bareRouterPush' })
                    }

                    if (methodName === 'replace') {
                        context.report({ node: route, messageId: 'bareRouterReplace' })
                    }
                }
            },

            'NewExpression[callee.name="URL"]'(node) {
                const route = bareRouteNode(node.arguments[0])

                if (route) {
                    context.report({ node: route, messageId: 'bareCallString', data: { callee: 'new URL' } })
                }
            },
        }
    },
}

export default noBareRouteStrings
