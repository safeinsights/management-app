// custom-rules/no-invalid-button-variant.mjs

// Mantine's defaultVariantColorsResolver returns {} for any name outside this set, leaving the
// component's colour custom properties unset so its CSS falls back to the primary colour — purple,
// which the rebrand deliberately kept. BoxProps widens `variant` to string, so TS cannot catch it.
const MANTINE_VARIANTS = ['filled', 'light', 'outline', 'transparent', 'white', 'subtle', 'default', 'gradient']

// Mantine components whose variant runs through that resolver. Components of our own that happen to
// take a `variant` prop (StatusAlert, FormFieldLabel, LaunchIdeButton) define their own names.
const GUARDED_COMPONENTS = ['Button', 'ButtonLink', 'ActionIcon', 'ThemeIcon']

const noInvalidButtonVariant = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow variant names Mantine cannot resolve, which fall back to the primary colour',
            recommended: true,
        },
        schema: [],
        messages: {
            unknownVariant:
                '"{{variant}}" is not a Mantine variant on <{{component}}>. Mantine resolves it to no colour at all, so the component falls back to the primary colour instead of the theme default. Use one of: {{allowed}}.',
        },
    },
    create(context) {
        function literalStringValue(value) {
            if (!value) return null
            if (value.type === 'Literal' && typeof value.value === 'string') return value
            if (value.type === 'JSXExpressionContainer') return literalStringValue(value.expression)
            return null
        }

        function guardedComponentName(openingElement) {
            const name = openingElement?.name
            if (name?.type !== 'JSXIdentifier') return null
            return GUARDED_COMPONENTS.includes(name.name) ? name.name : null
        }

        return {
            'JSXAttribute[name.name="variant"]'(node) {
                const component = guardedComponentName(node.parent)
                if (!component) return

                const literal = literalStringValue(node.value)
                if (!literal || MANTINE_VARIANTS.includes(literal.value)) return

                context.report({
                    node: literal,
                    messageId: 'unknownVariant',
                    data: {
                        variant: literal.value,
                        component,
                        allowed: MANTINE_VARIANTS.join(', '),
                    },
                })
            },
        }
    },
}

export default noInvalidButtonVariant
