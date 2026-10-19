'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react'
import clsx from 'clsx'
import { Box, Paper, Text, type MantineFontSize } from '@mantine/core'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { LinkHoverCardPlugin } from './link-hover-card-plugin'
import { Toolbar } from './toolbar'
import type { WidgetBlurProps } from '@/components/form-field'

export const DEFAULT_EDITOR_CONTENT_HEIGHT = 200

// Shared by the editable surface and its placeholder so the two sit exactly on top of each other.
const TEXT_METRICS = { px: 'md', py: 'xs', lh: 1.6 } as const

// A drag may not shrink the field below its content (OTTER-691). Applied as `min-height` so it
// coexists with the inline `height` a native drag writes; measuring the scroll container instead
// of `contentRef` would feed the floor its own value.
function useEditorHeightFloor(contentHeight: number, hostRef: RefObject<HTMLDivElement | null>) {
    const contentRef = useRef<HTMLDivElement>(null)
    const chromeRef = useRef<HTMLDivElement>(null)
    const [floor, setFloor] = useState<number | undefined>(undefined)

    useEffect(() => {
        const content = contentRef.current
        // Without an observer the box still auto-grows, it just cannot be resize-clamped.
        if (!content || typeof ResizeObserver === 'undefined') return

        const measure = () => {
            const host = hostRef.current
            // The bordered host is border-box, so without adding the border back the floor falls
            // a border short and dragging to it leaves a permanent scrollbar.
            const border = host ? host.offsetHeight - host.clientHeight : 0
            setFloor(content.offsetHeight + (chromeRef.current?.offsetHeight ?? 0) + border)
        }

        const observer = new ResizeObserver(measure)
        observer.observe(content)
        if (chromeRef.current) observer.observe(chromeRef.current)
        measure()

        return () => observer.disconnect()
    }, [contentHeight, hostRef])

    // Mantine turns numbers and px strings into rem, which stops matching a pixel measurement once
    // the browser's base font size is not 16px; calc() passes through unconverted.
    return { contentRef, chromeRef, floor: floor === undefined ? undefined : `calc(${floor}px)` }
}

export interface EditorSurfaceProps {
    inputId?: string
    contentClassName?: string
    /** The surface owns padding and line height; callers pick only the text size. */
    fz?: MantineFontSize
    placeholder?: string
    ariaLabel?: string
    ariaDescribedBy?: string
    ariaRequired?: boolean
    /** Presence drives the red border and `aria-invalid`; the caller renders the message. */
    error?: string | null
    widgetBlur: WidgetBlurProps<HTMLDivElement>
    contentHeight?: number
    /** Opt-in: OTTER-691 asks for a drag handle only on the Step 2 proposal fields. */
    isResizable?: boolean
    /** Lexical plugins, which differ between the collaborative and single-user editors. */
    children?: ReactNode
}

// Shared chrome because CI only runs single-user mode, so a defect in a duplicated collaborative
// copy would have nowhere to show up.
export function EditorSurface({
    inputId,
    contentClassName,
    fz,
    placeholder,
    ariaLabel,
    ariaDescribedBy,
    ariaRequired,
    error,
    widgetBlur,
    contentHeight = DEFAULT_EDITOR_CONTENT_HEIGHT,
    isResizable = false,
    children,
}: EditorSurfaceProps) {
    const { contentRef, chromeRef, floor } = useEditorHeightFloor(contentHeight, widgetBlur.ref)

    // Dragging the box taller leaves slack under the text where a click would otherwise do
    // nothing. Presses landing on the text itself keep their own caret placement.
    const focusFromSlack = useCallback(
        (event: MouseEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget) return
            contentRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus()
        },
        [contentRef],
    )

    return (
        <Paper
            p={0}
            className="collaborative-editor-container"
            mih={floor}
            data-resizable={isResizable || undefined}
            data-error={error ? true : undefined}
            {...widgetBlur}
        >
            <Box className="editable-text-scroll">
                <div ref={contentRef}>
                    <RichTextPlugin
                        contentEditable={
                            <Box
                                component={ContentEditable}
                                id={inputId}
                                className={clsx('editable-text-content', contentClassName)}
                                {...TEXT_METRICS}
                                fz={fz}
                                mih={contentHeight}
                                // Lexical sets no tabindex. Browsers still focus a contenteditable
                                // but happy-dom does not, so tests would silently no-op.
                                tabIndex={0}
                                ariaLabel={ariaLabel}
                                ariaDescribedBy={ariaDescribedBy}
                                ariaInvalid={error ? true : undefined}
                                ariaRequired={ariaRequired}
                            />
                        }
                        placeholder={<EditorPlaceholder text={placeholder} fz={fz} />}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                </div>
            </Box>
            {children}
            {/* Inside the field on purpose: a card in a portal would read as a blur (OTTER-647),
                and this position puts it before the toolbar in the tab order. */}
            <LinkHoverCardPlugin />
            <Box ref={chromeRef} p="xxs" onMouseDown={focusFromSlack}>
                <Toolbar />
            </Box>
        </Paper>
    )
}

const EditorPlaceholder = ({ text, fz }: { text?: string; fz?: MantineFontSize }) => {
    if (!text) return null

    return (
        <Text c="dimmed" pos="absolute" top={0} left={0} {...TEXT_METRICS} fz={fz} className="click-through">
            {text}
        </Text>
    )
}
