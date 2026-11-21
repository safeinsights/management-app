import { RuleTester } from 'eslint'
import typescriptEslint from 'typescript-eslint'
import { describe, it } from 'vitest'
import noDirectInvalidation from './no-direct-invalidation.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parser: typescriptEslint.parser,
    },
})

const errors = [{ messageId: 'directInvalidation' }]

ruleTester.run('noDirectInvalidation', noDirectInvalidation, {
    valid: [
        'useMutation({ mutationFn, invalidates: () => [queryKeys.orgs()] })',
        'queryClient.refetchQueries({ queryKey })',
        'queryClient.setQueryData(key, value)',
        'invalidateQueries()',
    ],
    invalid: [
        { code: 'queryClient.invalidateQueries({ queryKey: queryKeys.orgs() })', errors },
        { code: 'await useQueryClient().invalidateQueries()', errors },
        { code: 'client?.invalidateQueries({ queryKey })', errors },
    ],
})
