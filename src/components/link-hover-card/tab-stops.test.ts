import { describe, expect, it } from '@/tests/unit.helpers'
import { focusNextTabStopAfter, tabStopsIn } from './tab-stops'

const mount = (html: string) => {
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.append(root)
    return root
}

describe('tabStopsIn', () => {
    it('skips disabled controls and negative tabindex', () => {
        const root = mount(`
            <button id="a">a</button>
            <button id="b" disabled>b</button>
            <span id="c" tabindex="-1">c</span>
            <a id="d" href="/x">d</a>
            <a id="e">no href</a>
        `)

        expect(tabStopsIn(root).map((el) => el.id)).toEqual(['a', 'd'])
    })

    it('stops once on a radio group, at the checked radio', () => {
        const root = mount(`
            <input type="radio" name="group-1" id="yes" />
            <input type="radio" name="group-1" id="no" checked />
            <input type="radio" name="group-2" id="first" />
            <input type="radio" name="group-2" id="second" />
        `)

        expect(tabStopsIn(root).map((el) => el.id)).toEqual(['no', 'first'])
    })
})

describe('focusNextTabStopAfter', () => {
    it('focuses the next stop after the anchor, skipping the given container', () => {
        const root = mount(`
            <button id="before">before</button>
            <a id="anchor" href="/x">anchor</a>
            <div id="card"><button id="inside">inside</button></div>
            <button id="after">after</button>
        `)
        const anchor = root.querySelector<HTMLElement>('#anchor')!
        const card = root.querySelector<HTMLElement>('#card')!

        expect(focusNextTabStopAfter(anchor, card)).toBe(true)
        expect(document.activeElement?.id).toBe('after')
    })

    it('reports false when nothing follows the anchor', () => {
        const root = mount(`<a id="anchor" href="/x">anchor</a><div id="card"></div>`)
        const anchor = root.querySelector<HTMLElement>('#anchor')!

        expect(focusNextTabStopAfter(anchor, root.querySelector<HTMLElement>('#card')!)).toBe(false)
    })
})
