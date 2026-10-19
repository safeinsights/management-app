// Keeps styling decisions on the theme. Every raw value banned here has a token equivalent in
// src/theme/tokens.ts (colour, font weight) or on the Mantine theme scale (spacing, radius, font
// size). Mantine's `color` prop, and the object keys that feed it, may name an SI ramp: the theme
// maps those. The theme definition itself is exempted by glob in eslint.config.mjs — that is where
// raw values belong.

/** theme.spacing keys. Figma `Brand > Spacing`. */
const SPACING_SCALE = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl']

const SPACING_PROPS = [
    ...['p', 'm', 'mt', 'mb', 'ml', 'mr', 'mx', 'my', 'pt', 'pb', 'pl', 'pr', 'px', 'py', 'gap'],
    ...['spacing', 'verticalSpacing', 'horizontalSpacing'],
]

/** theme.radius keys. Figma `Brand > Corner-radius`. */
const RADIUS_SCALE = ['xs', 'sm', 'md', 'lg', 'xl']

const RADIUS_PROPS = ['radius', 'bdrs']

/** theme.fontSizes keys, plus Mantine's heading sizes. */
const FONT_SIZE_SCALE = ['xs', 'sm', 'md', 'lg', 'xl', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']

// Mantine reads `size` on these as a font size, the same as `fz`; on icons it is a dimension.
const TEXT_SIZE_ELEMENTS = ['Text', 'Title', 'Anchor', 'List']

const COLOR_PROPS = ['c', 'bg']

// Mantine's theme-colour prop on Badge, Alert, Button, ActionIcon, ThemeIcon, Burger, Loader…
const RAMP_COLOR_PROPS = ['color']

// Object keys that feed those props: badge config maps, notifications.show(), pill colour tables.
const OBJECT_COLOR_KEYS = [...COLOR_PROPS, ...RAMP_COLOR_PROPS]

// Defers to the surrounding colour rather than choosing one.
const CSS_COLOR_KEYWORDS = ['inherit', 'currentColor']

// Mantine aliases the theme rewires to semantic tokens in semanticCssVariables(). Passing these is
// a token lookup, not a raw value, so they stay allowed.
const WIRED_COLOR_ALIASES = ['dimmed']

// Helpers that resolve to a token; calling one is a lookup, not a raw value.
const TOKEN_HELPERS = ['semanticColor', 'cssVar']

// The ramps the theme defines. On Mantine's `color` prop a bare SI ramp name is the token route:
// mantineColorOverrides() maps each ramp's light/subtle variant to the library pairing.
const SI_RAMPS = ['navy', 'turquoise', 'red', 'green', 'yellow', 'blue', 'purple', 'grey', 'charcoal']

// Mantine's stock ramps. The theme defines none of them, so Mantine's own palette answers and an
// SI retint leaves the call site behind. `gray` and `dark` are the ones the migration keeps meeting.
const STOCK_RAMPS = ['gray', 'dark', 'pink', 'grape', 'violet', 'indigo', 'cyan', 'teal', 'lime', 'orange']

// A ramp shade reads as theme-ish while pointing at a fixed rung.
const RAMPS = [...SI_RAMPS, ...STOCK_RAMPS]
const SHADE = new RegExp(`^(?:${RAMPS.join('|')})\\.[0-9]$`)
// The same rung through Mantine's own variable. `var(--` alone would pass it as a token lookup.
const SHADE_VAR = /var\(\s*--mantine-color-[a-z]+-[0-9]\s*\)/
const isShade = (str) => SHADE.test(str) || SHADE_VAR.test(str)

/** `theme.colors` or a destructured `colors`. */
const isColorsObject = (node) =>
    (node.type === 'Identifier' && node.name === 'colors') ||
    (node.type === 'MemberExpression' && !node.computed && node.property.name === 'colors')

const HEX = /^#[0-9a-fA-F]{3,8}$/
const PX = /(?:^|\s)\d*\.?\d+px(?:\s|$)/
const CSS_VAR = /var\(\s*--/
// Figma font sizes with no scale key reach `fz` as --si-font-size-N; one that has a key must use it.
// Keep in step with typographyCssVariables in src/theme/tokens.ts, which this file cannot import.
const OFF_SCALE_FONT_SIZES = ['10', '22', '26', '34', '40']
const FONT_SIZE_VAR = /var\(\s*--si-font-size-(\d+)\s*\)/

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
                'The inline `style` prop bypasses the theme. Move a component-wide convention into theme.components. Prefer a Mantine prop or component feature for a local rule. A CSS module is a last resort (see CLAUDE.md).',
            oneOffStyles:
                'The one-off `styles` prop bypasses the theme. Move a component-wide convention into theme.components. Prefer a Mantine prop or component feature for a local rule. A CSS module is a last resort (see CLAUDE.md).',
            rawColor:
                '"{{value}}" on `{{prop}}` is a raw colour. Use semanticColor(…) from @/theme/tokens so a retint happens in one place.',
            rawWeight:
                '{{value}} is a raw font weight. Use fontWeight.regular / .semibold / .bold from @/theme/tokens.',
            rawSpacing: '{{value}} on `{{prop}}` is a raw spacing value. Use a theme scale key: {{scale}}.',
            rawRadius: '{{value}} on `{{prop}}` is a raw radius. Use a theme scale key: {{scale}}.',
            rawFontSize:
                '{{value}} is a raw font size. Use a theme scale key ({{scale}}), or var(--si-font-size-N) for a Figma size the scale lacks ({{offScale}}).',
            builtColor:
                'A colour assembled at runtime on `{{prop}}` cannot be checked against the theme. Pass a semanticColor(…) token instead.',
            hexLiteral: '"{{value}}" is a hardcoded colour. Use semanticColor(…) from @/theme/tokens.',
            rawShade:
                '"{{value}}" names a ramp rung directly. Use semanticColor(…) from @/theme/tokens so a retint reaches it.',
            pxLiteral: '"{{value}}" hardcodes pixels. Use a theme scale key.',
            stockRamp:
                '"{{value}}" is a Mantine stock ramp the theme does not define, so it paints from Mantine\'s palette and an SI retint never reaches it. Use an SI ramp ({{ramps}}) or semanticColor(…) from @/theme/tokens.',
        },
    },
    create(context) {
        /** Unwraps `{expr}` to the expression, leaving bare literals alone. */
        const unwrap = (value) => (value?.type === 'JSXExpressionContainer' ? value.expression : value)

        const isFontSizeAttr = (attr) =>
            attr?.name?.name === 'fz' ||
            (attr?.name?.name === 'size' && TEXT_SIZE_ELEMENTS.includes(attr.parent?.name?.name))

        const stringValue = (node) => (node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null)

        // `${hue}.9` or `hue + '.9'` names a rung the rule cannot read, so it must not pass for
        // lack of a string.
        const isBuiltString = (node) =>
            (node.type === 'TemplateLiteral' && node.expressions.length > 0) ||
            (node.type === 'BinaryExpression' && node.operator === '+')

        /**
         * A value already routed through the token layer. Narrow on purpose: anything that merely
         * *has a name* is not a token, or moving a banned literal into a constant would launder it.
         */
        const isTokenReference = (node) => {
            if (!node) return false
            if (node.type === 'CallExpression') return TOKEN_HELPERS.includes(node.callee?.name)
            if (node.type === 'MemberExpression') return node.object?.name === 'fontWeight'
            const str = stringValue(node)
            return str !== null && CSS_VAR.test(str) && !SHADE_VAR.test(str)
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
                if (str !== null && (isShade(str) || HEX.test(str) || PX.test(str))) return
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
                    return (
                        [...COLOR_PROPS, ...SPACING_PROPS, ...RADIUS_PROPS, 'fw'].includes(name) || isFontSizeAttr(attr)
                    )
                }
                if (parent.type !== 'ConditionalExpression') return false
                cur = parent
            }
            return false
        }

        /**
         * Inside `style={{…}}` / `styles={{…}}` the prop itself is reported, so a colour key in
         * that object must not be reported a second time.
         */
        const isInsideStyleAttribute = (node) => {
            for (let cur = node.parent; cur; cur = cur.parent) {
                if (cur.type === 'JSXAttribute') return cur.name?.name === 'style' || cur.name?.name === 'styles'
                if (cur.type === 'JSXElement' || cur.type === 'Program') return false
            }
            return false
        }

        // An object key has no isInsideStyleProp guard, so a shade/hex/px there is already the
        // Literal visitor's report and must not be doubled here.
        function checkColor(value, prop, { literalsReportedElsewhere = false } = {}) {
            eachValue(value, (node, at) => {
                if (isTokenReference(node)) return
                if (isBuiltString(node)) {
                    context.report({ node: at, messageId: 'builtColor', data: { prop } })
                    return
                }

                const str = stringValue(node)
                if (str === null || WIRED_COLOR_ALIASES.includes(str)) return
                if (literalsReportedElsewhere && (isShade(str) || HEX.test(str) || PX.test(str))) return

                context.report({ node: at, messageId: 'rawColor', data: { value: str, prop } })
            })
        }

        // `color` resolves through Mantine's palette, so an SI ramp name is a lookup and a stock
        // ramp name is the bug. Shades, hex and px are the Literal visitor's to report.
        function checkRampColor(value, prop) {
            eachValue(value, (node, at) => {
                if (isTokenReference(node)) return
                if (isBuiltString(node)) {
                    context.report({ node: at, messageId: 'builtColor', data: { prop } })
                    return
                }

                const str = stringValue(node)
                if (str === null) return
                if (SI_RAMPS.includes(str) || WIRED_COLOR_ALIASES.includes(str) || CSS_COLOR_KEYWORDS.includes(str))
                    return
                if (isShade(str) || HEX.test(str) || PX.test(str)) return

                if (STOCK_RAMPS.includes(str)) {
                    context.report({
                        node: at,
                        messageId: 'stockRamp',
                        data: { value: str, ramps: SI_RAMPS.join(', ') },
                    })
                    return
                }
                context.report({ node: at, messageId: 'rawColor', data: { value: str, prop } })
            })
        }

        function checkWeight(attrValue) {
            eachValue(attrValue, (value, at) => {
                if (isTokenReference(value)) return
                if (value.type !== 'Literal') return

                context.report({ node: at, messageId: 'rawWeight', data: { value: String(value.value) } })
            })
        }

        // An object key like `py` may be data rather than a style prop (a seed's language map), so
        // there only a number is taken as spacing; a px string is the Literal visitor's anyway.
        function checkSpacing(attrValue, prop, { numbersOnly = false } = {}) {
            eachValue(attrValue, (value, at) => {
                if (isTokenReference(value)) return
                if (value.type !== 'Literal') return
                if (numbersOnly && typeof value.value !== 'number') return

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

        function checkRadius(attrValue, prop, { numbersOnly = false } = {}) {
            eachValue(attrValue, (value, at) => {
                if (isTokenReference(value)) return
                if (value.type !== 'Literal') return
                if (numbersOnly && typeof value.value !== 'number') return
                if (value.value === 0 || value.value === '0' || RADIUS_SCALE.includes(value.value)) return

                context.report({
                    node: at,
                    messageId: 'rawRadius',
                    data: { value: String(value.value), prop, scale: RADIUS_SCALE.join(', ') },
                })
            })
        }

        // Mantine reads a numeric `fz` as px, so `fz={14}` is as raw as `fz="14px"`.
        function checkFontSize(attrValue, { literalsReportedElsewhere = false } = {}) {
            eachValue(attrValue, (value, at) => {
                const sizeVar = FONT_SIZE_VAR.exec(stringValue(value) ?? '')
                if (sizeVar ? OFF_SCALE_FONT_SIZES.includes(sizeVar[1]) : isTokenReference(value)) return
                if (value.type !== 'Literal') return
                if (FONT_SIZE_SCALE.includes(value.value)) return
                if (literalsReportedElsewhere && typeof value.value === 'string' && PX.test(value.value)) return

                context.report({
                    node: at,
                    messageId: 'rawFontSize',
                    data: {
                        value: String(value.value),
                        scale: FONT_SIZE_SCALE.join(', '),
                        offScale: OFF_SCALE_FONT_SIZES.join(', '),
                    },
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
                if (COLOR_PROPS.includes(name)) return checkColor(node.value, name)
                if (RAMP_COLOR_PROPS.includes(name)) return checkRampColor(node.value, name)
                if (name === 'fw') return checkWeight(node.value)
                if (isFontSizeAttr(node)) return checkFontSize(node.value)
                if (SPACING_PROPS.includes(name)) return checkSpacing(node.value, name)
                if (RADIUS_PROPS.includes(name)) return checkRadius(node.value, name)
            },

            // `theme.colors.green[7]` is 'green.7' read off the theme object instead of named; with
            // the ramp or rung picked by a variable it is the same rung, just unreadable here.
            MemberExpression(node) {
                const { object: ramp } = node
                if (!node.computed) return
                if (ramp.type !== 'MemberExpression' || !isColorsObject(ramp.object)) return

                context.report({ node, messageId: 'rawShade', data: { value: context.sourceCode.getText(node) } })
            },

            // Object expressions only: a destructuring pattern's `{ c }` is the caller's value.
            Property(node) {
                if (node.parent?.type !== 'ObjectExpression' || node.computed || node.shorthand) return
                const key =
                    node.key.type === 'Identifier'
                        ? node.key.name
                        : node.key.type === 'Literal'
                          ? String(node.key.value)
                          : null
                if (!key || isInsideStyleAttribute(node)) return
                if (key === 'fw') return checkWeight(node.value)
                if (key === 'fz') return checkFontSize(node.value, { literalsReportedElsewhere: true })
                if (SPACING_PROPS.includes(key)) return checkSpacing(node.value, key, { numbersOnly: true })
                if (RADIUS_PROPS.includes(key)) return checkRadius(node.value, key, { numbersOnly: true })
                if (!OBJECT_COLOR_KEYS.includes(key)) return

                if (RAMP_COLOR_PROPS.includes(key)) return checkRampColor(node.value, key)
                checkColor(node.value, key, { literalsReportedElsewhere: true })
            },

            Literal(node) {
                if (typeof node.value !== 'string') return
                // A style prop reports its own, more specific message, however deep the literal
                // sits inside the value (a ternary branch, a call argument).
                if (isInsideStyleProp(node)) return
                if (isShade(node.value)) {
                    context.report({ node, messageId: 'rawShade', data: { value: node.value } })
                    return
                }
                // Already a token lookup: `1px solid var(--si-color-border-default)` names a token
                // colour, and a hairline border has no spacing key to move to.
                if (CSS_VAR.test(node.value)) return
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
