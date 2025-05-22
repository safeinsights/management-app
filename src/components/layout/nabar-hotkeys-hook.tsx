'use client'

import { forwardRef, RefObject, useCallback, useEffect } from 'react'

interface RefWrapperProps {
  children: React.ReactNode
  role?: string
  tabIndex?: number
  className?: string
}

// for components that need to be focusable but don't have a native focusable element
export const RefWrapper = forwardRef<HTMLDivElement, RefWrapperProps>(
    ({ children, role = 'menuitem', tabIndex = 0, className }, ref) => {
        return (
            <div ref={ref} role={role} tabIndex={tabIndex} className={className}>
                {children}
            </div>
        )
    },
)

RefWrapper.displayName = 'RefWrapper'

export type NavigationDirection = 'natural' | 'reversed'

interface UseNavKeyboardOProps {
    elements: Array<RefObject<HTMLElement | null> | null>
    onActivate?: (element: HTMLElement) => void
    onEscape?: () => void
    circular?: boolean
    toggleRef?: RefObject<HTMLElement | null>
    isOpen?: boolean
    onToggle?: () => void
    onClose?: () => void
    direction?: NavigationDirection
}

// hook to handle keyboard navigation for a set of elements.
export function useKeyboardNav({
    elements,
    onActivate,
    onEscape,
    circular = true,
    toggleRef,
    isOpen,
    onToggle,
    onClose,
    direction = 'natural',
}: UseNavKeyboardOProps) {
    const getValidElements = useCallback(() => {
        return elements.map((ref) => ref?.current).filter((el): el is HTMLElement => el !== null)
    }, [elements])

    const focusElement = useCallback(
        (index: number) => {
            const validElements = getValidElements()
            if (validElements.length === 0) return

            const targetIndex = circular
                ? (index + validElements.length) % validElements.length
                : Math.max(0, Math.min(index, validElements.length - 1))

            validElements[targetIndex]?.focus()
        },
        [getValidElements, circular],
    )

    const navigate = useCallback(
        (dir: 1 | -1) => {
            const validElements = getValidElements()
            if (validElements.length === 0) return

            const currentIndex = validElements.indexOf(document.activeElement as HTMLElement)
            const adjustedDir = direction === 'reversed' ? -dir : dir

            if (currentIndex === -1) {
                focusElement(adjustedDir > 0 ? 0 : validElements.length - 1)
            } else {
                focusElement(currentIndex + adjustedDir)
            }
        },
        [getValidElements, focusElement, direction],
    )

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const validElements = getValidElements()

            if (validElements.length === 0) return

            const activeElement = document.activeElement as HTMLElement
            const isActivatable =
                activeElement &&
                (activeElement.getAttribute('role') === 'menuitem' ||
                    activeElement.getAttribute('role') === 'button' ||
                    activeElement.tagName.toLowerCase() === 'a')

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    navigate(1)
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    navigate(-1)
                    break
                case 'Enter':
                    if (isActivatable) {
                        e.preventDefault()
                        if (onActivate) {
                            onActivate(activeElement)
                        } else {
                            activeElement.click()
                        }
                    }
                    break
                case 'Escape':
                    if (onEscape) {
                        onEscape()
                    } else if (isOpen && onClose) {
                        onClose()
                        toggleRef?.current?.focus()
                    }
                    break
            }
        }

        const handleToggleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown' && !isOpen && onToggle) {
                e.preventDefault()
                onToggle()
                requestAnimationFrame(() => focusElement(0))
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        const toggleNode = toggleRef?.current
        toggleNode?.addEventListener('keydown', handleToggleKeyDown)

        // cleanup
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            toggleNode?.removeEventListener('keydown', handleToggleKeyDown)
        }
    }, [getValidElements, navigate, focusElement, onActivate, onEscape, onClose, onToggle, isOpen, toggleRef])

    return { focusElement, navigate, getActiveElements: getValidElements }
}
