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

export const DEFAULT_EDITOR_CONTENT_HEIGHT = 200

// `contentStyle.minHeight` is a fallback because callers predating `contentHeight` express the
// same thing that way.
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

// A drag may not shrink the field below its content (OTTER-691). Applied as `min-height` so it
// coexists with the inline `height` a native drag writes; measuring the scroll container instead
// of `contentRef` would feed the floor its own value.
function useEditorHeightFloor(contentHeight: CSSProperties['minHeight'], hostRef: RefObject<HTMLDivElement | null>) {
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

    // Dragging the box taller leaves slack under the text where a click would otherwise do
    // nothing. Presses landing on the text itself keep their own caret placement.
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
                                // Lexical sets no tabindex. Browsers still focus a contenteditable
                                // but happy-dom does not, so tests would silently no-op.
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
