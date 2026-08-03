/**
 * Scrolls to and focuses the first invalid field, reading the page top to bottom.
 *
 * `fieldIds` must be in visual/DOM order — that ordering IS the "first" the caller promises the
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
    node.focus({ preventScroll: true })
    return target
}
