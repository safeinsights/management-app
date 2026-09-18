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
