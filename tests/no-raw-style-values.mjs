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

// Helpers that resolve to a token; calling one is a lookup, not a raw value.
const TOKEN_HELPERS = ['semanticColor', 'cssVar']

// Ramp shades resolve through Mantine's palette lookup, so they read as theme-ish while pointing
// at a fixed rung. `gray` and `dark` are worse: the theme defines neither, so Mantine's stock
// palette answers and an SI retint leaves them behind.
const RAMPS = [
    'navy',
    'turquoise',
    'red',
    'green',
    'yellow',
    'blue',
    'purple',
    'grey',
    'charcoal',
    'gray',
    'dark',
    'pink',
    'grape',
    'violet',
    'indigo',
    'cyan',
    'teal',
    'lime',
    'orange',
]
const SHADE = new RegExp(`^(?:${RAMPS.join('|')})\\.[0-9]$`)

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
            oneOffStyles:
                'The one-off `styles` prop bypasses the theme. Move a component-wide convention into theme.components, or a genuinely local rule into a CSS module referencing --mantine-*/--si-* variables.',
            rawColor:
                '"{{value}}" on `{{prop}}` is a raw colour. Use semanticColor(…) from @/theme/tokens so a retint happens in one place.',
            rawWeight:
                '{{value}} is a raw font weight. Use fontWeight.regular / .semibold / .bold from @/theme/tokens.',
            rawSpacing: '{{value}} on `{{prop}}` is a raw spacing value. Use a theme scale key: {{scale}}.',
            hexLiteral: '"{{value}}" is a hardcoded colour. Use semanticColor(…) from @/theme/tokens.',
            rawShade:
                '"{{value}}" names a ramp rung directly. Use semanticColor(…) from @/theme/tokens so a retint reaches it.',
            pxLiteral: '"{{value}}" hardcodes pixels. Use a theme scale key, or rem() in a CSS module.',
        },
    },
    create(context) {
        /** Unwraps `{expr}` to the expression, leaving bare literals alone. */
        const unwrap = (value) => (value?.type === 'JSXExpressionContainer' ? value.expression : value)

        const stringValue = (node) => (node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null)

        /**
         * A value already routed through the token layer. Narrow on purpose: anything that merely
         * *has a name* is not a token, or moving a banned literal into a constant would launder it.
         */
        const isTokenReference = (node) => {
            if (!node) return false
            if (node.type === 'CallExpression') return TOKEN_HELPERS.includes(node.callee?.name)
            if (node.type === 'MemberExpression') return node.object?.name === 'fontWeight'
            const str = stringValue(node)
            return str !== null && CSS_VAR.test(str)
        }

        /** Same-file `const X = <literal>`, so hiding a raw value behind a name is not a bypass. */
        const resolveConstant = (node) => {
            for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
                const variable = scope.variables.find((v) => v.name === node.name)
                if (!variable) continue
                const [def] = variable.defs
                // Only a const initialiser is knowable here; a parameter or prop belongs to the
                // caller, and an import is another module's to answer for.
                if (def?.type !== 'Variable' || def.parent?.kind !== 'const') return null
                return def.node.init ?? null
            }
            return null
        }

        /**
         * Runs `check` over a prop value, seeing through `{…}`, both ternary branches, and a
         * same-file constant — the shapes a migration teaches people to hide a literal in.
         * Reports at the use site so each offending prop is flagged where it is applied.
         */
        const eachValue = (value, check) => {
            const node = unwrap(value)
            if (!node) return
            if (node.type === 'ConditionalExpression') {
                eachValue(node.consequent, check)
                eachValue(node.alternate, check)
                return
            }
            if (node.type === 'Identifier') {
                const init = resolveConstant(node)
                if (!init) return
                // A shade/hex/px string is reported where it is defined, so reporting the use site
                // too would double up. A number is invisible to that visitor, so it reports here.
                const str = stringValue(init)
                if (str !== null && (SHADE.test(str) || HEX.test(str) || PX.test(str))) return
                check(init, node)
                return
            }
            check(node, node)
        }

        /**
         * True when a style prop's own check already covers this literal. Only `{…}` and ternary
         * branches qualify — the shapes `eachValue` walks. A literal buried in a call argument is
         * beyond its reach, so the generic visitor must still report it.
         */
        const isInsideStyleProp = (node) => {
            let cur = node
            while (cur.parent) {
                const parent = cur.parent
                if (parent.type === 'JSXExpressionContainer' || parent.type === 'JSXAttribute') {
                    const attr = parent.type === 'JSXAttribute' ? parent : parent.parent
                    const name = attr?.name?.name
                    return COLOR_PROPS.includes(name) || SPACING_PROPS.includes(name) || name === 'fw'
                }
                if (parent.type !== 'ConditionalExpression') return false
                cur = parent
            }
            return false
        }

        function checkColor(attr, prop) {
            eachValue(attr.value, (value, at) => {
                if (isTokenReference(value)) return

                const str = stringValue(value)
                if (str === null || WIRED_COLOR_ALIASES.includes(str)) return

                context.report({ node: at, messageId: 'rawColor', data: { value: str, prop } })
            })
        }

        function checkWeight(attr) {
            eachValue(attr.value, (value, at) => {
                if (isTokenReference(value)) return
                if (value.type !== 'Literal') return

                context.report({ node: at, messageId: 'rawWeight', data: { value: String(value.value) } })
            })
        }

        function checkSpacing(attr, prop) {
            eachValue(attr.value, (value, at) => {
                if (isTokenReference(value)) return
                if (value.type !== 'Literal') return

                // 0 is not a spacing step and reads clearly as "none"; the scale has no token for it.
                if (value.value === 0 || value.value === '0') return
                // `auto` is layout, not spacing.
                if (value.value === 'auto') return
                // Mantine resolves a leading `-` against the same scale, so `-md` is still a token.
                const key = typeof value.value === 'string' ? value.value.replace(/^-/, '') : value.value
                if (SPACING_SCALE.includes(key)) return

                context.report({
                    node: at,
                    messageId: 'rawSpacing',
                    data: { value: String(value.value), prop, scale: SPACING_SCALE.join(', ') },
                })
            })
        }

        return {
            JSXAttribute(node) {
                const name = node.name?.type === 'JSXIdentifier' ? node.name.name : null
                if (!name) return

                if (name === 'style' || name === 'styles') {
                    context.report({ node, messageId: name === 'style' ? 'inlineStyle' : 'oneOffStyles' })
                    return
                }
                if (COLOR_PROPS.includes(name)) return checkColor(node, name)
                if (name === 'fw') return checkWeight(node)
                if (SPACING_PROPS.includes(name)) return checkSpacing(node, name)
            },

            Literal(node) {
                if (typeof node.value !== 'string') return
                // Already a token lookup: `1px solid var(--mantine-color-gray-3)` names a token
                // colour, and a hairline border has no spacing key to move to.
                if (CSS_VAR.test(node.value)) return
                // A style prop reports its own, more specific message, however deep the literal
                // sits inside the value (a ternary branch, a call argument).
                if (isInsideStyleProp(node)) return
                if (SHADE.test(node.value)) {
                    context.report({ node, messageId: 'rawShade', data: { value: node.value } })
                    return
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
