import { RuleTester } from 'eslint'
import typescriptEslint from 'typescript-eslint'
import { describe, it } from 'vitest'
import noRawStyleValues from './no-raw-style-values.mjs'

// RuleTester drives its own runner unless handed the framework's hooks; without this it asserts
// at import time and vitest reports the file as having no suite.
RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
})

ruleTester.run('noRawStyleValues', noRawStyleValues, {
    valid: [
        // Theme scale keys are the whole point of the migration.
        '<Stack p="md" mt="lg" gap="xs" />',
        '<Text c="dimmed" />',
        '<Box bg={semanticColor("surface.sunken")} />',
        '<Box c={semanticColor("text.primary")} />',
        '<Text fw={fontWeight.semibold} />',
        // Zero has no token and reads clearly as "none".
        '<Stack p={0} m={0} />',
        '<Stack p="0" />',
        // `auto` is CSS layout, not a spacing step.
        '<Box mx="auto" m="auto" />',
        // Mantine resolves a leading `-` against the same scale.
        '<Box mt="-md" ml="-xs" />',
        // A CSS variable reference is already a token lookup.
        '<Box bg="var(--si-color-surface-page)" />',
        '<Box bg={cssVar("surface.page")} />',
        // A forwarded prop belongs to the caller; this component decides nothing.
        'const Row = ({ c }) => <Text c={c} />',
        'const Row = ({ gap }) => <Stack gap={gap} />',
        // Both ternary branches are tokens.
        '<Text c={isActive ? semanticColor("text.white") : semanticColor("text.secondary")} />',
        '<Text c={x ?? semanticColor("text.secondary")} />',
        // Mantine's `color` prop takes a ramp name; the theme maps the SI ramps' variants to tokens.
        '<Alert color="red" />',
        '<Badge color="grey" variant="light" />',
        '<Burger color={semanticColor("text.white")} />',
        '<Icon color="currentColor" />',
        '<Text color="inherit" />',
        'const Row = ({ color }) => <Badge color={color} />',
        'const Row = ({ c = "dimmed" }) => <Text c={c} />',
        // Object literals feed the same props, so the same names pass.
        `notifications.show({ color: 'green', message: 'Saved' })`,
        `const CONFIG = { done: { color: 'green', label: 'Done' } }`,
        `const MUTED = { c: 'dimmed' }`,
        // Mantine's variant variables are what the theme rewires to tokens; only a numbered rung is raw.
        '<Box bg="var(--mantine-color-red-light)" />',
        '<Box bd="1px solid var(--si-color-border-default)" />',
        // A whole ramp is the theme's own plumbing rather than a choice.
        'const ramp = theme.colors.green',
        'const { [hue]: ramp } = theme.colors',
        // A caller's colour is the caller's to answer for.
        'const T = ({ color }) => <Text c={color} />',
        '<Text fz="sm" />',
        '<Title fz="h3" />',
        // Figma's 10px has no scale key; its variable is the token.
        '<Text fz="var(--si-font-size-10)" />',
        '<Text size="sm" />',
        '<Title order={2} size="h4" />',
        '<List size="md" />',
        // On an icon or ActionIcon, `size` is a dimension, not a font size.
        '<CheckIcon size={16} />',
        '<ActionIcon size={28} />',
        `<Text fz={isProminent ? 'sm' : undefined} />`,
        'const T = ({ fz }) => <Text fz={fz} />',
        `const LABEL = { fw: fontWeight.semibold, fz: 'sm' }`,
        '<Text lh="var(--si-line-height-tight)" />',
        `const METRICS = { lh: 'var(--si-line-height-normal)' }`,
        // A responsive value is checked per breakpoint.
        `<Paper my={{ base: 'md', lg: 0 }} />`,
        `<Text lh={{ base: 'var(--si-line-height-tight)', sm: 'var(--si-line-height-normal)' }} />`,
        `<Text fz={{ base: 'sm', md: 'lg' }} fw={{ base: fontWeight.semibold }} />`,
        `const MARGIN = { base: 'md', lg: 0 }; const P = () => <Paper my={MARGIN} />`,
        '<List spacing="xxs" />',
        '<Table verticalSpacing="sm" horizontalSpacing="md" />',
        '<Skeleton radius="sm" />',
        '<Paper radius={0} bdrs="xs" />',
        `const CARD = { p: 'md', gap: 'xs', radius: 'sm' }`,
        // A key that shares a prop's name is not always a style: a seed's language → command map.
        `const RUN = { py: 'python main.py', r: 'Rscript main.r' }`,
        // A dotted string with a runtime part is only a rung when the rest names one.
        'const file = `${name}.${ext}`',
        'const label = `${count}.`',
    ],
    invalid: [
        {
            code: '<Text c="charcoal.9" />',
            errors: [{ messageId: 'rawColor' }],
        },
        // A ternary is where a raw colour hid from the old check: neither branch was a Literal.
        {
            code: `<Text c={isActive ? 'white' : 'charcoal.7'} />`,
            errors: [{ messageId: 'rawColor' }, { messageId: 'rawColor' }],
        },
        // Naming a literal does not make it a token. A shade is reported at its definition, which
        // is the only place it can be fixed — and is why the rule must also read `.ts`.
        {
            code: `const APP_MAIN_BG = 'grey.0'; const S = () => <Box bg={APP_MAIN_BG} />`,
            errors: [{ messageId: 'rawShade' }],
        },
        // `gray` and `dark` have no SI ramp at all, so these silently use Mantine's stock palette.
        {
            code: `const COLORS = { draft: { bg: 'grey.0', c: 'gray.9' }, other: { c: 'dark.5' } }`,
            errors: [{ messageId: 'rawShade' }, { messageId: 'rawShade' }, { messageId: 'rawShade' }],
        },
        // A shade handed to an arbitrary helper is still a shade.
        {
            code: `<Box bg={pickColor('grey.0')} />`,
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: 'const CARD_SECTION_GAP = 24; const S = () => <Stack gap={CARD_SECTION_GAP} />',
            errors: [{ messageId: 'rawSpacing' }],
        },
        // The card scopes one-off `styles={}` alongside inline `style={}`; the same raw value must
        // not pass in one form and fail in the other.
        {
            code: '<TextInput styles={{ label: { fontWeight: 600, marginBottom: 4 } }} />',
            errors: [{ messageId: 'oneOffStyles' }],
        },
        {
            code: '<Text c="grey.7" />',
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: '<Box bg="#f3f8fb" />',
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: '<Text fw={600} />',
            errors: [{ messageId: 'rawWeight' }],
        },
        {
            code: '<Text fw="bold" />',
            errors: [{ messageId: 'rawWeight' }],
        },
        {
            code: '<Stack p={16} />',
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: '<Box mt="-0.5rem" />',
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: '<Stack mt={24} gap={8} />',
            errors: [{ messageId: 'rawSpacing' }, { messageId: 'rawSpacing' }],
        },
        {
            code: '<div style={{ marginTop: 4 }} />',
            errors: [{ messageId: 'inlineStyle' }],
        },
        {
            code: '<Box style={{ color: "var(--si-color-text-primary)" }} />',
            errors: [{ messageId: 'inlineStyle' }],
        },
        {
            code: 'const c = "#ff0000"',
            errors: [{ messageId: 'hexLiteral' }],
        },
        {
            code: 'const gap = "12px"',
            errors: [{ messageId: 'pxLiteral' }],
        },
        // Stock Mantine ramps the theme never defines: the badge contrast failures QA measured were
        // `color: 'teal'` and `color="orange"`, invisible to a check that only knew `c` and `bg`.
        {
            code: '<Badge color="teal" />',
            errors: [{ messageId: 'stockRamp' }],
        },
        {
            code: `const CONFIG = { done: { color: 'teal', label: 'Done' } }`,
            errors: [{ messageId: 'stockRamp' }],
        },
        {
            code: `notifications.show({ color: 'orange', message: 'Wait' })`,
            errors: [{ messageId: 'stockRamp' }],
        },
        {
            code: `<ActionIcon color={isBusy ? 'gray' : 'grey'} />`,
            errors: [{ messageId: 'stockRamp' }],
        },
        // A shade or hex on `color` is reported once, by the literal visitor.
        {
            code: '<Badge color="teal.5" />',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: '<Chip color="#D4D1F3" />',
            errors: [{ messageId: 'hexLiteral' }],
        },
        // `white` has a token (text.white); a bare keyword bypasses it like it does on `c`.
        {
            code: '<Burger color="white" />',
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: `const PILL = { bg: 'white', c: 'black' }`,
            errors: [{ messageId: 'rawColor' }, { messageId: 'rawColor' }],
        },
        // Inside `style`/`styles` the prop itself is the report; its keys are not reported again.
        {
            code: `<Box style={{ display: 'flex', color: 'gray' }} />`,
            errors: [{ messageId: 'inlineStyle' }],
        },
        {
            code: `<Alert styles={{ icon: { color: 'teal' } }} />`,
            errors: [{ messageId: 'oneOffStyles' }],
        },
        // A rung through Mantine's own variable is still a rung; `var(--` alone does not make a token.
        {
            code: '<CheckIcon color="var(--mantine-color-gray-6)" />',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: '<Text c="var(--mantine-color-red-7)" />',
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: `const BORDER = '1px solid var(--mantine-color-gray-3)'`,
            errors: [{ messageId: 'rawShade' }],
        },
        // Read off the theme object, a shade has no string for the literal checks to see.
        {
            code: '<CheckIcon color={theme.colors.green[7]} />',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: '<Box bg={rgba(theme.colors.grey[0], 0.3)} />',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: 'const color = theme.colors.blue[7]; const I = () => <FileIcon color={color} />',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: 'const { colors } = useMantineTheme(); const I = () => <Text c={colors.red[7]} />',
            errors: [{ messageId: 'rawShade' }],
        },
        // A ramp or rung picked by a variable is still a fixed rung, just one the rule cannot read.
        {
            code: '<CheckIcon color={theme.colors[hue][9]} />',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: 'const shade = theme.colors.green[level]',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: '<Text c={`${hue}.9`} />',
            errors: [{ messageId: 'builtColor' }],
        },
        {
            code: '<Text c={color ? `${color}.6` : "dimmed"} />',
            errors: [{ messageId: 'builtColor' }],
        },
        // On `color` and object keys a built shade is the shade visitor's, as a literal one is.
        {
            code: '<Badge color={`${ramp}.5`} />',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: 'const MAP = { done: { bg: `${hue}.0` } }',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: `<Text c={hue + '.9'} />`,
            errors: [{ messageId: 'builtColor' }],
        },
        // A rung built away from the prop: in a helper, a constant, or with the level picked.
        {
            code: 'const shade = (h) => `${h}.9`; const T = () => <Text c={shade(hue)} />',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: `const toShade = (h) => h + '.9'`,
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: 'const S = `${hue}.9`; const T = () => <Text c={S} />',
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: 'const accent = `green.${level}`',
            errors: [{ messageId: 'rawShade' }],
        },
        // A fallback or cast is still the value the prop receives.
        {
            code: '<Text c={x ?? `${hue}.9`} />',
            errors: [{ messageId: 'builtColor' }],
        },
        {
            code: `<Text c={x || 'charcoal.9'} />`,
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: `<Badge color={x ?? 'teal.5'} />`,
            errors: [{ messageId: 'rawShade' }],
        },
        {
            code: '<Stack p={gap ?? 16} />',
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: '<Text c={`${hue}.9` as MantineColor} />',
            languageOptions: { parser: typescriptEslint.parser },
            errors: [{ messageId: 'builtColor' }],
        },
        {
            code: `<Text c={'charcoal.9' satisfies MantineColor} />`,
            languageOptions: { parser: typescriptEslint.parser },
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: '<Stack p={(gap ?? 16)!} />',
            languageOptions: { parser: typescriptEslint.parser },
            errors: [{ messageId: 'rawSpacing' }],
        },
        // Mantine reads a numeric `fz` as px.
        {
            code: '<Text fz={14} />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        {
            code: '<Text fz="13px" />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        {
            code: 'const SECTION_FONT_SIZE = 14; const S = () => <Text fz={SECTION_FONT_SIZE} />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        // 14px has a scale key, so its variable is a second name for `sm`; 22px is `h3`.
        {
            code: '<Text fz="var(--si-font-size-14)" />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        {
            code: '<Title fz="var(--si-font-size-22)" />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        // Mantine reads `size` on Text, Title, Anchor and List as `fz`.
        {
            code: '<Text size={13} />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        {
            code: '<Title size={22} />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        {
            code: '<Text size="13px" />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        {
            code: '<Anchor size={13} />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        {
            code: '<List size={13} />',
            errors: [{ messageId: 'rawFontSize' }],
        },
        // Typography in a prop object or config map is the same raw value one step removed.
        {
            code: `const LABEL = { fw: 600, fz: 14 }`,
            errors: [{ messageId: 'rawWeight' }, { messageId: 'rawFontSize' }],
        },
        {
            code: `const LABEL = { fz: '13px' }`,
            errors: [{ messageId: 'pxLiteral' }],
        },
        // A unitless line height is as raw as a px one.
        {
            code: '<Text lh={1.2} />',
            errors: [{ messageId: 'rawLineHeight' }],
        },
        {
            code: '<Text lh="1.2" />',
            errors: [{ messageId: 'rawLineHeight' }],
        },
        {
            code: '<Text lh="20px" />',
            errors: [{ messageId: 'rawLineHeight' }],
        },
        {
            code: `const METRICS = { pl: 'md', lh: 1.6 }`,
            errors: [{ messageId: 'rawLineHeight' }],
        },
        // The theme sets no lineHeights: these resolve to Mantine's own, off the Figma scale.
        {
            code: '<Text lh="lg" />',
            errors: [{ messageId: 'rawLineHeight' }],
        },
        {
            code: '<Text lh="var(--mantine-line-height-lg)" />',
            errors: [{ messageId: 'rawLineHeight' }],
        },
        // A responsive object must not hide a raw value at a breakpoint.
        {
            code: `<Paper my={{ base: '1rem', lg: 0 }} />`,
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: '<Text lh={{ base: 1.2, sm: 1.6 }} />',
            errors: [{ messageId: 'rawLineHeight' }, { messageId: 'rawLineHeight' }],
        },
        {
            code: `<Text fz={{ base: 13, sm: '13px' }} fw={{ base: 500 }} />`,
            errors: [{ messageId: 'rawFontSize' }, { messageId: 'rawFontSize' }, { messageId: 'rawWeight' }],
        },
        {
            code: `<Text c={{ base: 'red.5' }} />`,
            errors: [{ messageId: 'rawColor' }],
        },
        {
            code: `const MARGIN = { base: 16 }; const P = () => <Paper my={MARGIN} />`,
            errors: [{ messageId: 'rawSpacing' }],
        },
        // A cast on the constant must not hide its raw values.
        {
            code: `const MARGIN = { base: 16, lg: 0 } as const; const P = () => <Paper my={MARGIN} />`,
            languageOptions: { parser: typescriptEslint.parser },
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: `const LH = 1.6 as const; const T = () => <Text lh={LH} />`,
            languageOptions: { parser: typescriptEslint.parser },
            errors: [{ messageId: 'rawLineHeight' }],
        },
        {
            code: `const CARD = { my: { base: 16 } }`,
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: `const CARD = { p: 16, radius: 4 }`,
            errors: [{ messageId: 'rawSpacing' }, { messageId: 'rawRadius' }],
        },
        {
            code: '<List spacing={4} />',
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: '<Table verticalSpacing={4} />',
            errors: [{ messageId: 'rawSpacing' }],
        },
        {
            code: '<Skeleton radius={4} />',
            errors: [{ messageId: 'rawRadius' }],
        },
        {
            code: '<Box bdrs="12px" />',
            errors: [{ messageId: 'rawRadius' }],
        },
    ],
})
