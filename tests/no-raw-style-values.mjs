// Keeps styling decisions on the theme. Every raw value banned here has a token equivalent in
// src/theme/tokens.ts (colour, font weight) or on the Mantine theme scale (spacing). The theme
// definition itself is exempted by glob in eslint.config.mjs — that is where raw values belong.

/** theme.spacing keys. Figma `Brand > Spacing`. */
const SPACING_SCALE = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl']

const SPACING_PROPS = ['p', 'm', 'mt', 'mb', 'ml', 'mr', 'mx', 'my', 'pt', 'pb', 'pl', 'pr', 'px', 'py', 'gap']

const COLOR_PROPS = ['c', 'bg']

// Mantine aliases the theme rewires to semantic tokens in semanticCssVariables(). Passing these is
// a token lookup, not a raw value, so they stay allowed.
const WIRED_COLOR_ALIASES = ['dimmed']

const HEX = /^#[0-9a-fA-F]{3,8}$/
const PX = /(?:^|\s)\d*\.?\d+px(?:\s|$)/
const CSS_VAR = /var\(\s*--/

const noRawStyleValues = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require theme tokens instead of raw colour, weight, spacing and inline style values',
            recommended: true,
        },
        schema: [],
        messages: {
            inlineStyle:
                'The inline `style` prop bypasses the theme. Move a component-wide convention into theme.components, or a genuinely local rule into a CSS module referencing --mantine-*/--si-* variables.',
            rawColor:
                '"{{value}}" on `{{prop}}` is a raw colour. Use semanticColor(…) from @/theme/tokens so a retint happens in one place.',
            rawWeight:
                '{{value}} is a raw font weight. Use fontWeight.regular / .semibold / .bold from @/theme/tokens.',
            rawSpacing: '{{value}} on `{{prop}}` is a raw spacing value. Use a theme scale key: {{scale}}.',
            hexLiteral: '"{{value}}" is a hardcoded colour. Use semanticColor(…) from @/theme/tokens.',
            pxLiteral: '"{{value}}" hardcodes pixels. Use a theme scale key, or rem() in a CSS module.',
        },
    },
    create(context) {
        /** Unwraps `{expr}` to the expression, leaving bare literals alone. */
        const unwrap = (value) => (value?.type === 'JSXExpressionContainer' ? value.expression : value)

        const stringValue = (node) => (node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null)

        /** A value already routed through the token layer. */
        const isTokenReference = (node) => {
            if (!node) return false
            // semanticColor('text.primary') / fontWeight.semibold / anything var(--…)
            if (node.type === 'CallExpression') return true
            if (node.type === 'MemberExpression' || node.type === 'Identifier') return true
            const str = stringValue(node)
            return str !== null && CSS_VAR.test(str)
        }

        function checkColor(node, prop) {
            const value = unwrap(node.value)
            if (isTokenReference(value)) return

            const str = stringValue(value)
            if (str === null || WIRED_COLOR_ALIASES.includes(str)) return

            context.report({ node: value, messageId: 'rawColor', data: { value: str, prop } })
        }

        function checkWeight(node) {
            const value = unwrap(node.value)
            if (isTokenReference(value)) return
            if (!value || value.type !== 'Literal') return

            context.report({ node: value, messageId: 'rawWeight', data: { value: String(value.value) } })
        }

        function checkSpacing(node, prop) {
            const value = unwrap(node.value)
            if (isTokenReference(value)) return
            if (!value || value.type !== 'Literal') return

            // 0 is not a spacing step and reads clearly as "none"; the scale has no token for it.
            if (value.value === 0 || value.value === '0') return
            // `auto` is layout, not spacing.
            if (value.value === 'auto') return
            // Mantine resolves a leading `-` against the same scale, so `-md` is still a token.
            const key = typeof value.value === 'string' ? value.value.replace(/^-/, '') : value.value
            if (SPACING_SCALE.includes(key)) return

            context.report({
                node: value,
                messageId: 'rawSpacing',
                data: { value: String(value.value), prop, scale: SPACING_SCALE.join(', ') },
            })
        }

        return {
            JSXAttribute(node) {
                const name = node.name?.type === 'JSXIdentifier' ? node.name.name : null
                if (!name) return

                if (name === 'style') {
                    context.report({ node, messageId: 'inlineStyle' })
                    return
                }
                if (COLOR_PROPS.includes(name)) return checkColor(node, name)
                if (name === 'fw') return checkWeight(node)
                if (SPACING_PROPS.includes(name)) return checkSpacing(node, name)
            },

            Literal(node) {
                if (typeof node.value !== 'string') return
                // Colour and spacing props report their own, more specific message.
                if (node.parent?.type === 'JSXAttribute' || node.parent?.type === 'JSXExpressionContainer') {
                    const attr = node.parent.type === 'JSXAttribute' ? node.parent : node.parent.parent
                    const attrName = attr?.name?.name
                    if (COLOR_PROPS.includes(attrName) || SPACING_PROPS.includes(attrName) || attrName === 'fw') {
                        return
                    }
                }
                if (HEX.test(node.value)) {
                    context.report({ node, messageId: 'hexLiteral', data: { value: node.value } })
                    return
                }
                if (PX.test(node.value)) {
                    context.report({ node, messageId: 'pxLiteral', data: { value: node.value } })
                }
            },
        }
    },
}

export default noRawStyleValues
