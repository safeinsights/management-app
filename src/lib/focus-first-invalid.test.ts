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

    // A Mantine Radio.Group puts the field id on a plain <div>, where focus() is a silent no-op.
    it('focuses the first focusable control when the id sits on a non-focusable wrapper', () => {
        const wrapper = document.createElement('div')
        wrapper.id = 'radio-group'
        wrapper.scrollIntoView = vi.fn()
        const label = document.createElement('label')
        const radio = document.createElement('input')
        radio.type = 'radio'
        label.appendChild(radio)
        wrapper.appendChild(label)
        document.body.appendChild(wrapper)

        expect(focusFirstInvalid(['radio-group'], () => true)).toBe('radio-group')
        expect(document.activeElement).toBe(radio)
    })

    it('skips disabled controls inside a wrapper', () => {
        const wrapper = document.createElement('div')
        wrapper.id = 'group-with-disabled'
        wrapper.scrollIntoView = vi.fn()
        const disabled = document.createElement('input')
        disabled.disabled = true
        const enabled = document.createElement('input')
        wrapper.append(disabled, enabled)
        document.body.appendChild(wrapper)

        focusFirstInvalid(['group-with-disabled'], () => true)

        expect(document.activeElement).toBe(enabled)
    })
})
