/** @type {import('@ladle/react').UserConfig} */
const config = {
    // Scoped to the new design system only — UX reviews the standardized components without the
    // legacy app stories alongside them. The pre-existing stories under src/ are untouched on disk;
    // widen this glob back to 'src/**' as they are migrated onto the ui/ components.
    stories: 'src/components/ui/**/*.stories.{ts,tsx}',
    viteConfig: '.ladle/vite.config.ts',
}

export default config
