// Shared config for Ladle's built-in background control (a toolbar swatch that repaints the story
// canvas; see https://ladle.dev/docs/background). One control is allowed, so this is the single
// source of its options. Values are real surfaces from the app theme — the app-canvas grey and the
// focused-shell navy are CSS vars, so they track the theme like the rest of the catalog.
//
// White is the default surface: it's honest for leaf components (buttons, inputs, file viewers,
// loading), which sit inside white cards/modals in the app. Page-level and panel stories opt into
// the app-canvas grey via `pageBackgroundArgTypes` on their meta, matching the AppShellMain area.

const WHITE = '#ffffff'
const APP_CANVAS = 'var(--si-color-surface-canvas)'
const NAVY = 'var(--mantine-color-navy-7)'

const control = {
    type: 'background' as const,
    labels: { [WHITE]: 'White', [APP_CANVAS]: 'App canvas', [NAVY]: 'Navy' },
}
const options = [WHITE, APP_CANVAS, NAVY]

/** Global default — white surface. */
export const backgroundArgTypes = { background: { control, options, defaultValue: WHITE } }

/** For page-level / panel story files: default to the app-canvas grey. Spread into the file's
 *  meta, e.g. `export default { title: 'Pages / …', argTypes: pageBackgroundArgTypes }`. */
export const pageBackgroundArgTypes = { background: { control, options, defaultValue: APP_CANVAS } }

/** For focused-shell stories (sign-in, MFA, reset password): default to the navy backdrop. */
export const focusedBackgroundArgTypes = { background: { control, options, defaultValue: NAVY } }
