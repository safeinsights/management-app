/**
 * Scrolls to and focuses the first invalid field, reading the page top to bottom.
 *
 * `fieldIds` must be in visual/DOM order, because that ordering IS the "first" the caller promises the
 * user, and nothing else in the DOM recovers it (a Lexical contenteditable and a radio group
 * share no common wrapper to compare positions against).
 *
 * Focus, not just scroll: a highlighted field the caret never reaches leaves a screen-reader
 * user with no idea which control failed.
 */
export function focusFirstInvalid(fieldIds: string[], hasError: (fieldId: string) => boolean): string | null {
    const target = fieldIds.find(hasError)
    if (!target) return null

    const node = typeof document === 'undefined' ? null : document.getElementById(target)
    if (!node) return target

    node.scrollIntoView({ block: 'center', behavior: 'smooth' })
    focusable(node).focus({ preventScroll: true })
    return target
}

/**
 * The element to actually put the caret on.
 *
 * A field's id may sit on a wrapper rather than a control: a Mantine `Radio.Group` renders its id
 * on a non-focusable `<div>`, so calling focus() on it silently does nothing and leaves the user on
 * the submit button with no idea which field failed. Descend to the first focusable descendant in
 * that case.
 */
function focusable(node: HTMLElement): HTMLElement {
    if (node.tabIndex >= 0) return node
    const inner = node.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
    )
    return inner ?? node
}
