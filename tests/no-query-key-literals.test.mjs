import { RuleTester } from 'eslint'
import typescriptEslint from 'typescript-eslint'
import { describe, it } from 'vitest'
import noQueryKeyLiterals from './no-query-key-literals.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parser: typescriptEslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
})

const errors = [{ messageId: 'keyLiteral' }]

ruleTester.run('noQueryKeyLiterals', noQueryKeyLiterals, {
    valid: [
        'useQuery({ queryKey: queryKeys.study(id), queryFn })',
        'useQuery({ queryKey: props.queryKey(sort), queryFn })',
        'useQuery({ queryKey, queryFn })',
        'useQuery({ queryKey: key, queryFn })',
        'queryClient.invalidateQueries({ queryKey: queryKeys.orgs() })',
        'queryClient.setQueryData(queryKeys.navUnread(userId), data)',
        'queryClient.getQueryData(key)',
        "const columns = ['a', 'b']",
        "doSomething(['x'], value)",
        '<AgreementsTable queryKey={(sort) => queryKeys.legal.userStudyAgreements(sort)} />',
        'useQuery({ queryKey: cond ? queryKeys.orgs() : queryKeys.study(id), queryFn })',
        'useMutation({ mutationFn, invalidates: () => [queryKeys.orgs(), ...keys] })',
        'useMutation({ mutationFn, invalidates: () => keys })',
    ],
    invalid: [
        { code: "useQuery({ queryKey: ['x'], queryFn })", errors },
        { code: 'useQuery({ queryKey: [...k, id], queryFn })', errors },
        { code: "queryClient.invalidateQueries({ queryKey: ['orgs'] })", errors },
        { code: "queryClient.removeQueries({ 'queryKey': ['x', id] })", errors },
        { code: "queryClient.setQueryData(['x'], value)", errors },
        { code: "queryClient.setQueryData<Data>(['x', id], (prev) => prev)", errors },
        { code: "queryClient.getQueryData(['x'])", errors },
        { code: "queryClient.getQueryState(['x'])", errors },
        { code: "<AgreementsTable queryKey={['x']} />", errors },
        { code: "useQuery({ queryKey: ['x', id] as const, queryFn })", errors },
        { code: "useQuery({ queryKey: ['x'] satisfies QueryKey, queryFn })", errors },
        { code: "useQuery({ queryKey: cond ? queryKeys.orgs() : ['x'], queryFn })", errors },
        { code: "queryClient.setQueryData(['x', id] as const, value)", errors },
        { code: "<AgreementsTable queryKey={['x'] as const} />", errors },
        { code: "useMutation({ mutationFn, invalidates: () => [['org', slug]] })", errors },
        { code: "useMutation({ mutationFn, invalidates: function () { return [queryKeys.orgs(), ['x']] } })", errors },
        { code: "useMutation({ mutationFn, invalidates: () => [['x'] as const] })", errors },
        { code: "useMutation({ mutationFn, invalidates: () => (cond ? [['x']] : []) })", errors },
    ],
})
