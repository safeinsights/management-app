// `fieldIds` must be in visual order — that ordering IS the "first" promised to the user, and
// nothing in the DOM recovers it.
export function focusFirstInvalid(fieldIds: string[], hasError: (fieldId: string) => boolean): string | null {
    const target = fieldIds.find(hasError)
    if (!target) return null

    const node = typeof document === 'undefined' ? null : document.getElementById(target)
    if (!node) return target

    node.scrollIntoView({ block: 'center', behavior: 'smooth' })
    focusable(node).focus({ preventScroll: true })
    return target
}

// A field's id may sit on a wrapper rather than a control (Mantine `Radio.Group` renders its
// id on a non-focusable `<div>`, where focus() silently does nothing).
function focusable(node: HTMLElement): HTMLElement {
    if (node.tabIndex >= 0) return node
    const inner = node.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
    )
    return inner ?? node
}
