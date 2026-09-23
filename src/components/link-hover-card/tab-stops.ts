const TAB_STOP_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]',
    '[contenteditable="true"]',
].join(',')

// Tab visits a named radio group once: on its checked radio, or on the first when none is checked.
function isRadioGroupStop(radio: HTMLInputElement) {
    const group = Array.from(document.getElementsByName(radio.name)).filter(
        (element): element is HTMLInputElement =>
            element instanceof HTMLInputElement && element.type === 'radio' && element.form === radio.form,
    )
    const checked = group.find((element) => element.checked)

    return radio === (checked ?? group[0])
}

function isTabStop(element: HTMLElement) {
    if (element.tabIndex < 0) return false
    if (element instanceof HTMLInputElement && element.type === 'radio' && element.name) {
        return isRadioGroupStop(element)
    }
    return true
}

export function tabStopsIn(root: ParentNode): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(TAB_STOP_SELECTOR)).filter(isTabStop)
}

/**
 * Focuses the first tab stop after `anchor` in document order, skipping anything inside `skip`.
 * A stop that is hidden or inert refuses focus, so the next one is tried.
 */
export function focusNextTabStopAfter(anchor: HTMLElement, skip: HTMLElement): boolean {
    const following = tabStopsIn(document.body).filter(
        (stop) =>
            !skip.contains(stop) &&
            !anchor.contains(stop) &&
            Boolean(anchor.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING),
    )

    return following.some((stop) => {
        stop.focus()
        return document.activeElement === stop
    })
}
