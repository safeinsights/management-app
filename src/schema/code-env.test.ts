import { describe, it, expect } from '@/tests/unit.helpers'
import { createOrgCodeEnvFormSchema, editOrgCodeEnvFormSchema } from '@/schema/code-env'

const file = (name: string) => new File(['code'], name)

const validForm = (overrides: Record<string, unknown>) => ({
    name: 'R env',
    identifier: 'r_env',
    commandLines: { r: 'Rscript %f', py: 'python %f' },
    language: 'R',
    url: 'example.com/test-image:tag-1234',
    starterCodes: [file('stub.R')],
    ...overrides,
})

const starterCodeErrors = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
    (result.error?.issues ?? []).filter((i) => i.path[0] === 'starterCodes').map((i) => i.message)

describe('starter code template name (OTTER-1106)', () => {
    it('accepts several files when only the first could take the template name', () => {
        const result = createOrgCodeEnvFormSchema.safeParse(
            validForm({ starterCodes: [file('Main.R'), file('reference.R')] }),
        )

        expect(starterCodeErrors(result)).toEqual([])
    })

    it('rejects a later file that would overwrite the renamed template', () => {
        const result = createOrgCodeEnvFormSchema.safeParse(
            validForm({ starterCodes: [file('stub.R'), file('main.r')] }),
        )

        expect(starterCodeErrors(result)).toEqual([
            'The first file is renamed Main.R, so no other file can use that name. Rename main.r.',
        ])
    })

    it('reserves the name for the selected language only', () => {
        const result = createOrgCodeEnvFormSchema.safeParse(
            validForm({ language: 'PYTHON', starterCodes: [file('stub.py'), file('Main.R')] }),
        )

        expect(starterCodeErrors(result)).toEqual([])
    })

    it('checks the existing files when an edit uploads nothing new', () => {
        const result = editOrgCodeEnvFormSchema.safeParse(
            validForm({ starterCodes: [], existingStarterCodeFileNames: ['stub.R', 'Main.R'] }),
        )

        expect(starterCodeErrors(result)).toEqual([
            'The first file is renamed Main.R, so no other file can use that name. Rename Main.R.',
        ])
    })
})
