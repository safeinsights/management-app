import { RuleTester } from 'eslint'
import typescriptEslint from 'typescript-eslint'
import { describe, it } from 'vitest'
import noBareRouteStrings from './no-bare-route-strings.mjs'

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

const callError = (callee) => [{ messageId: 'bareCallString', data: { callee } }]

ruleTester.run('noBareRouteStrings', noBareRouteStrings, {
    valid: [
        'redirect(Routes.home)',
        'permanentRedirect(Routes.home)',
        'revalidatePath(Routes.adminSettings({ orgSlug }))',
        'redirect(`${Routes.accountSignin}?invite_not_found=1`)',
        'new URL(Routes.dashboard, req.url)',
        'NextResponse.redirect(new URL(Routes.dashboard, req.url))',
        'router.push(Routes.dashboard)',
        "new URL('https://example.com/a')",
        "new URL('//cdn.example.com/a')",
        'new URL(`//cdn.example.com/${p}`)',
        'redirect(`//${host}/x`)',
        'revalidatePath(path)',
        "notRedirect('/x')",
        "foo.redirect('/x')",
        '<a href="https://x.org">x</a>',
        'redirect()',
        'new URL()',
        'redirect(...args)',
        'redirect(Routes.home as Route)',
        'router.push(`${Routes.dashboard}?x=1` as Route)',
        '<Link href={Routes.dashboard} />',
    ],
    invalid: [
        { code: "revalidatePath('/dashboard')", errors: callError('revalidatePath') },
        { code: 'revalidatePath(`/admin/team/${orgSlug}/settings`)', errors: callError('revalidatePath') },
        { code: "redirect('/')", errors: callError('redirect') },
        { code: 'redirect(`/account/signin?x=1`, RedirectType.replace)', errors: callError('redirect') },
        { code: "permanentRedirect('/dashboard')", errors: callError('permanentRedirect') },
        { code: "new URL('/account/signin', req.url)", errors: callError('new URL') },
        { code: 'new URL(`/study/${id}`, base)', errors: callError('new URL') },
        { code: '<Link href="/dashboard" />', errors: [{ messageId: 'bareHrefString' }] },
        { code: "router.push('/x')", errors: [{ messageId: 'bareRouterPush' }] },
        { code: 'router.replace(`/x/${id}`)', errors: [{ messageId: 'bareRouterReplace' }] },
        { code: "revalidatePath('/admin/team/x' as Route)", errors: callError('revalidatePath') },
        { code: "redirect('/dashboard' satisfies string)", errors: callError('redirect') },
        { code: "new URL('/x'!, base)", errors: callError('new URL') },
        { code: "router.push(('/x' as string) as Route)", errors: [{ messageId: 'bareRouterPush' }] },
        { code: '<Link href={"/dashboard"} />', errors: [{ messageId: 'bareHrefString' }] },
        {
            code: '<Link href={`/account/signin?invite_id=${id}` as Route} />',
            errors: [{ messageId: 'bareHrefString' }],
        },
    ],
})
