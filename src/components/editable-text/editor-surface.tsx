'use client'

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type MouseEvent,
    type ReactNode,
    type RefObject,
} from 'react'
import { Paper, Text } from '@mantine/core'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { Toolbar } from './toolbar'
import type { WidgetBlurProps } from '@/components/form-field'

/** Content-area height used by any caller that specifies neither `contentHeight` nor a `minHeight`. */
export const DEFAULT_EDITOR_CONTENT_HEIGHT = 200

/**
 * The editable area's starting height.
 *
 * `contentHeight` is the explicit prop and wins. Callers that predate it express the same thing as
 * `minHeight` inside `contentStyle`, so that is the fallback: overwriting it with the default
 * would silently resize every editor in the app that never opted into per-field heights.
 */
export const resolveContentHeight = (contentHeight?: number, contentStyle?: CSSProperties) =>
    contentHeight ?? contentStyle?.minHeight ?? DEFAULT_EDITOR_CONTENT_HEIGHT

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
 * `minHeight: startingHeight`, so what this measures is `max(default, actual content)` and the
 * floor is that plus the toolbar.
 *
 * `min-height` rather than `height` is deliberate, and the two coexist rather than compete.
 * Dragging the native handle writes an inline `height` on this element (verified in Chromium),
 * which is the user's manual size; `min-height` is the floor the drag cannot cross. Because React
 * only ever writes `minHeight` here, re-rendering does not clobber the height the browser wrote,
 * so a manual size survives every subsequent render. That is also what keeps auto-growth working
 * after a manual resize: typing raises the floor above the dragged height and pushes the box back
 * open, and deleting that text lowers the floor again, leaving the manual height in charge.
 *
 * What is measured matters. `contentRef` wraps the editable surface but is never stretched (the
 * scroll container is the flex child that absorbs slack), so its height is the content's own
 * height. Measuring the scroll container instead would feed the floor back its own value after a
 * manual enlarge and the field could never be shrunk again.
 */
function useEditorHeightFloor(contentHeight: CSSProperties['minHeight'], hostRef: RefObject<HTMLDivElement | null>) {
    const contentRef = useRef<HTMLDivElement>(null)
    const chromeRef = useRef<HTMLDivElement>(null)
    const [floor, setFloor] = useState<number | undefined>(undefined)

    useEffect(() => {
        const content = contentRef.current
        // happy-dom and older browsers: without an observer the box still auto-grows, it just
        // cannot be resize-clamped. Degrading to "no floor" beats crashing the editor.
        if (!content || typeof ResizeObserver === 'undefined') return

        const measure = () => {
            const host = hostRef.current
            // The floor lands on the bordered host, which is border-box, so the border has to be
            // added back. Without it the floor is a border's worth short of what the content needs
            // and dragging down to it leaves a permanent scrollbar in the scroll area.
            const border = host ? host.offsetHeight - host.clientHeight : 0
            setFloor(content.offsetHeight + (chromeRef.current?.offsetHeight ?? 0) + border)
        }

        const observer = new ResizeObserver(measure)
        observer.observe(content)
        if (chromeRef.current) observer.observe(chromeRef.current)
        measure()

        return () => observer.disconnect()
    }, [contentHeight, hostRef])

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
    /**
     * Height of the editable area before any typing or dragging. Falls back to
     * `contentStyle.minHeight`, then to {@link DEFAULT_EDITOR_CONTENT_HEIGHT}.
     */
    contentHeight?: number
    /**
     * Opt-in, and false everywhere it is not passed. OTTER-691 asks for a drag handle on the
     * Step 2 proposal fields; the reviewer-feedback, code-review and outputs-decision editors that
     * share this surface never had one, and turning it on for them is a UI change no card asked
     * for. Read-only fields simply never opt in, which is what keeps a dead grip off a submitted
     * proposal.
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
    contentHeight,
    isResizable = false,
    children,
}: EditorSurfaceProps) {
    const startingHeight = resolveContentHeight(contentHeight, contentStyle)
    const { contentRef, chromeRef, floor } = useEditorHeightFloor(startingHeight, widgetBlur.ref)

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
        borderColor: error ? 'var(--mantine-color-error)' : undefined,
    }
    const editableStyle: CSSProperties = { ...contentStyle, minHeight: startingHeight }

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
