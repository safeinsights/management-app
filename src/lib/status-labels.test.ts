import { describe, expect, it } from 'vitest'
import { PILL_PRESENTATION, resolvePillPresentation, type PillContext, type PillId } from './status-labels'
import { RESEARCHER_PILL_RULES, REVIEWER_PILL_RULES } from './study-screen'

const NAMES = { dataPartner: 'Openstax', researchLab: 'Openstax Lab' }
const ids = Object.keys(PILL_PRESENTATION) as PillId[]
const roles: PillContext['role'][] = ['researcher', 'reviewer']

describe('PILL_PRESENTATION', () => {
    it('gives every badge a non-empty label', () => {
        for (const id of ids) {
            expect(PILL_PRESENTATION[id].label.length, id).toBeGreaterThan(0)
        }
    })

    it('leaves no placeholder unresolved in any tooltip, for either role', () => {
        for (const id of ids) {
            for (const role of roles) {
                const tooltip = resolvePillPresentation(id, { role, ...NAMES }).tooltip
                if (!tooltip) continue
                expect(tooltip, `${id}/${role}`).not.toMatch(/[{}]/)
            }
        }
    })

    // Every rule table entry has to find copy, or the pill renders undefined.
    it('covers every id both rule tables can produce', () => {
        const produced = new Set<string>([
            ...RESEARCHER_PILL_RULES.map(([id]) => id),
            ...REVIEWER_PILL_RULES.map(([id]) => id),
        ])
        for (const id of produced) {
            expect(PILL_PRESENTATION[id as PillId], id).toBeDefined()
        }
    })

    // A badge nothing can select is dead copy, so the two sets must match exactly.
    it('defines no badge the rule tables can never select', () => {
        const produced = new Set<string>([
            ...RESEARCHER_PILL_RULES.map(([id]) => id),
            ...REVIEWER_PILL_RULES.map(([id]) => id),
        ])
        expect([...ids].filter((id) => !produced.has(id))).toEqual([])
    })
})
