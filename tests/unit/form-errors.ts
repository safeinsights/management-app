import { screen } from '@testing-library/react'
import { expect } from 'vitest'

// The error the field announces, found only when it carries the design's icon.
export function describedError(input: HTMLElement) {
    const ids = input.getAttribute('aria-describedby')?.split(' ') ?? []
    return ids.map((id) => document.getElementById(id)).find((el) => el?.querySelector('svg'))
}

// InputError renders the icon and the text as siblings, so the text's parent holds the icon
// whether Mantine shows the error in its own `<p>` or a form renders it standalone.
export async function findFieldErrorShownOnce(message: string | RegExp) {
    const matches = await screen.findAllByText(message)
    expect(matches).toHaveLength(1)
    expect(matches[0].parentElement?.querySelectorAll('svg')).toHaveLength(1)
    return matches[0]
}
