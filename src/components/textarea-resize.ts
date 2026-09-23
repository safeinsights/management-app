import type { TextareaProps } from '@mantine/core'

/**
 * Mantine floors a multiline input at one input row rather than at the height the field loads at,
 * so `resize` on its own lets a drag shrink the field below its own default. A minHeight above the
 * natural height makes the load height and the floor the same number (OTTER-787).
 */
export const TEXTAREA_RESIZE_FLOOR = 72

// A growing field passes the floor from `useTextareaResizeFloor`, which is null before the first
// measurement. Null rather than undefined, so it does not fall back to the fixed floor.
export const resizableTextareaProps = (floor: number | null = TEXTAREA_RESIZE_FLOOR) =>
    ({
        resize: 'vertical',
        styles: { input: { minHeight: floor ?? undefined } },
    }) satisfies Pick<TextareaProps, 'resize' | 'styles'>
