// Gives CSS modules Mantine's mixins (light-dark, hover, breakpoint queries) and rem(), so
// stylesheets can express spacing and colour in theme terms instead of hardcoded px and hex.
const config = {
    plugins: {
        'postcss-preset-mantine': {},
    },
}

export default config
