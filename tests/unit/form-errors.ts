import { screen } from '@testing-library/react'
import { expect } from 'vitest'

export function describedElements(input: HTMLElement) {
    const ids = input.getAttribute('aria-describedby')?.split(' ') ?? []
    return ids.map((id) => document.getElementById(id))
}

// The error the field announces, found only when it carries the design's icon.
export function describedError(input: HTMLElement) {
    return describedElements(input).find((el) => el?.querySelector('svg'))
}

// Count icons in Mantine's whole error `<p>` so a doubly wrapped error fails. A standalone
// InputError has no `<p>`, so its own group (the text's parent) holds the icon.
export async function findFieldErrorShownOnce(message: string | RegExp) {
    const matches = await screen.findAllByText(message)
    expect(matches).toHaveLength(1)
    const container = matches[0].closest('p') ?? matches[0].parentElement
    expect(container?.querySelectorAll('svg')).toHaveLength(1)
    return matches[0]
}
