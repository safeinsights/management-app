'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { Paper, Text } from '@mantine/core'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { Toolbar } from './toolbar'
import type { WidgetBlurProps } from '@/components/form-field'

/** Content-area height used by any caller that does not specify one. */
export const DEFAULT_EDITOR_CONTENT_HEIGHT = 200

/** Absorbs the slack when the box is dragged taller, so the measured content stays its own size. */
const SCROLL_AREA_STYLE: CSSProperties = { position: 'relative', flex: 1, overflow: 'auto' }

const PLACEHOLDER_BASE_STYLE: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
}

/**
 * Tracks the height the editor would take with no manual sizing, so it can be applied as the
 * resize floor (OTTER-691).
 *
 * The card asks for two floors: a manual resize may not shrink a field below its default height,
 * nor below its current auto-resized height, and says in as many words that the two combine to
 * "cannot go below whichever is currently taller". Both are expressed here at once, because the
 * measured wrapper already sits on top of the default: the editable surface carries
 * `minHeight: contentHeight`, so what this measures is `max(default, actual content)` and the
 * floor is that plus the toolbar.
 *
 * `min-height` rather than `height` is deliberate. Chrome does not reliably write an inline
 * `height` when a native resize handle is dragged, so reading the dragged size back is not
 * portable, but both Blink and Gecko honor `min-height` as a lower bound the user cannot drag
 * past. That makes one declaration do the whole job, and it keeps auto-growth working after a
 * manual resize: typing raises the floor, which pushes the box back open.
 *
 * What is measured matters. `contentRef` wraps the editable surface but is never stretched (the
 * scroll container is the flex child that absorbs slack), so its height is the content's own
 * height. Measuring the scroll container instead would feed the floor back its own value after a
 * manual enlarge and the field could never be shrunk again.
 */
function useEditorHeightFloor(contentHeight: number) {
    const contentRef = useRef<HTMLDivElement>(null)
    const chromeRef = useRef<HTMLDivElement>(null)
    const [floor, setFloor] = useState<number | undefined>(undefined)

    useEffect(() => {
        const content = contentRef.current
        // happy-dom and older browsers: without an observer the box still auto-grows, it just
        // cannot be resize-clamped. Degrading to "no floor" beats crashing the editor.
        if (!content || typeof ResizeObserver === 'undefined') return

        const measure = () => setFloor(content.offsetHeight + (chromeRef.current?.offsetHeight ?? 0))

        const observer = new ResizeObserver(measure)
        observer.observe(content)
        if (chromeRef.current) observer.observe(chromeRef.current)
        measure()

        return () => observer.disconnect()
    }, [contentHeight])

    return { contentRef, chromeRef, floor }
}

export interface EditorSurfaceProps {
    inputId?: string
    contentClassName?: string
    contentStyle?: CSSProperties
    placeholder?: string
    ariaLabel?: string
    ariaDescribedBy?: string
    ariaRequired?: boolean
    /** Presence drives the red border and `aria-invalid`; the caller renders the message. */
    error?: string | null
    /** Click-outside plumbing from `useWidgetBlur`, applied to the surface root. */
    widgetBlur: WidgetBlurProps<HTMLDivElement>
    /** Height of the editable area before any typing or dragging. */
    contentHeight?: number
    /**
     * False once the field is read-only. Removes the resize handle outright rather than leaving a
     * grip that does nothing, which is what the card asks for on a submitted proposal.
     */
    isResizable?: boolean
    /** Lexical plugins. They differ between the collaborative and single-user editors. */
    children?: ReactNode
}

/**
 * The editor chrome shared by `CollaborativeEditor` and `SingleUserEditor`: the bordered box, the
 * editable surface, the placeholder and the toolbar. Extracted so the resize behavior above exists
 * once. The two editors previously carried near-identical copies of this markup, and CI runs
 * single-user mode, so a defect in the collaborative copy had nowhere to show up.
 */
export function EditorSurface({
    inputId,
    contentClassName,
    contentStyle,
    placeholder,
    ariaLabel,
    ariaDescribedBy,
    ariaRequired,
    error,
    widgetBlur,
    contentHeight = DEFAULT_EDITOR_CONTENT_HEIGHT,
    isResizable = true,
    children,
}: EditorSurfaceProps) {
    const { contentRef, chromeRef, floor } = useEditorHeightFloor(contentHeight)

    // Dragging the box taller leaves slack under the text, and a click there would otherwise do
    // nothing. Only a press on the scroll container itself counts, so presses that land on the
    // text keep their own caret placement.
    const focusFromSlack = useCallback(
        (event: MouseEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget) return
            contentRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus()
        },
        [contentRef],
    )

    const surfaceStyle: CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: floor,
        resize: isResizable ? 'vertical' : 'none',
        borderColor: error ? 'var(--mantine-color-red-filled)' : undefined,
    }
    const editableStyle: CSSProperties = { ...contentStyle, minHeight: contentHeight }

    return (
        <Paper p={0} className="collaborative-editor-container" style={surfaceStyle} {...widgetBlur}>
            <div style={SCROLL_AREA_STYLE} onMouseDown={focusFromSlack}>
                <div ref={contentRef}>
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                id={inputId}
                                className={contentClassName}
                                style={editableStyle}
                                // Lexical sets no tabindex of its own. A browser still focuses a
                                // contenteditable, but happy-dom does not, so `focusFirstInvalid`
                                // would silently no-op in tests and the "jump to the first
                                // flagged field" rule would look covered while being untested.
                                tabIndex={0}
                                ariaLabel={ariaLabel}
                                ariaDescribedBy={ariaDescribedBy}
                                ariaInvalid={error ? true : undefined}
                                ariaRequired={ariaRequired}
                            />
                        }
                        placeholder={<EditorPlaceholder text={placeholder} contentStyle={contentStyle} />}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                </div>
            </div>
            {children}
            <div ref={chromeRef}>
                <Toolbar />
            </div>
        </Paper>
    )
}

const EditorPlaceholder = ({ text, contentStyle }: { text?: string; contentStyle?: CSSProperties }) => {
    if (!text) return null

    // Mirrors the editable surface's own text metrics so the two sit exactly on top of each other.
    const style: CSSProperties = {
        ...PLACEHOLDER_BASE_STYLE,
        padding: contentStyle?.padding,
        fontSize: contentStyle?.fontSize,
        lineHeight: contentStyle?.lineHeight,
    }

    return (
        <Text c="dimmed" style={style}>
            {text}
        </Text>
    )
}
