export default {
    '*.{js,jsx,ts,tsx,md,html,css}': ['prettier --write', 'eslint --fix'],
    '*.ts?(x)': () => 'tsc -p tsconfig.json --noEmit',
}
