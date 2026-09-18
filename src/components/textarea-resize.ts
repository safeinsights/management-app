import type { TextareaProps } from '@mantine/core'

/**
 * Mantine floors a multiline input at one input row rather than at the height the field loads at,
 * so `resize` on its own lets a drag shrink the field below its own default. A minHeight above the
 * natural height makes the load height and the floor the same number (OTTER-787).
 */
export const TEXTAREA_RESIZE_FLOOR = 72

export const resizableTextareaProps = {
    resize: 'vertical',
    styles: { input: { minHeight: TEXTAREA_RESIZE_FLOOR } },
} satisfies Pick<TextareaProps, 'resize' | 'styles'>

/**
 * The same handle for a field whose floor follows its content, from `useTextareaResizeFloor`. Kept
 * out of the JSX because a style object built inline in a return statement is a repo rule breach.
 */
export const growingTextareaProps = (floor?: number) =>
    ({
        resize: 'vertical',
        styles: { input: { minHeight: floor } },
    }) satisfies Pick<TextareaProps, 'resize' | 'styles'>
