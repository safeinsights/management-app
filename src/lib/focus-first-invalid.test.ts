import { describe, expect, it, vi } from '@/tests/unit.helpers'
import { focusFirstInvalid } from './focus-first-invalid'

const addField = (id: string) => {
    const node = document.createElement('input')
    node.id = id
    node.scrollIntoView = vi.fn()
    document.body.appendChild(node)
    return node
}

describe('focusFirstInvalid', () => {
    it('returns null and focuses nothing when every field is valid', () => {
        addField('a')
        expect(focusFirstInvalid(['a'], () => false)).toBeNull()
        expect(document.activeElement?.id).not.toBe('a')
    })

    // The array order is the contract: the user was promised the first flagged field reading
    // top to bottom, so a later-but-listed-first field must not win.
    it('focuses the first invalid field in the given order, not the first invalid found in the DOM', () => {
        const first = addField('first')
        addField('second')

        expect(focusFirstInvalid(['first', 'second'], () => true)).toBe('first')
        expect(document.activeElement).toBe(first)
        expect(first.scrollIntoView).toHaveBeenCalled()
    })

    it('skips valid fields to reach the invalid one', () => {
        addField('valid')
        const invalid = addField('invalid')

        expect(focusFirstInvalid(['valid', 'invalid'], (id) => id === 'invalid')).toBe('invalid')
        expect(document.activeElement).toBe(invalid)
    })

    it('reports the field even when it is not in the DOM', () => {
        expect(focusFirstInvalid(['missing'], () => true)).toBe('missing')
    })
})
