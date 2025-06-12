## [v0.0.5 - 2025-06-09](https://github.com/safeinsights/management-app/blob/main)

| PR | Author | Title | Merged Date | Internal Ticket # |
|----|--------|-------|-------------|-------------------|
| #239 | stetradis | OTTER-147 add approval dates to researcher study details | 2025-06-02 22:26:29 | [OTTER-147](https://openstax.atlassian.net/browse/OTTER-147) |
| #241 | stetradis | OTTER-192 update study results text | 2025-06-02 22:27:17 | [OTTER-192](https://openstax.atlassian.net/browse/OTTER-192) |
| #246 | nathanstitt | Capture decryption errors | 2025-06-03 14:18:47 | [OTTER-175](https://openstax.atlassian.net/browse/OTTER-175) |
| #245 | jbwilson8 | update job review button label spacing to match study review button label spacing | 2025-06-03 14:54:14 | [OTTER-134](https://openstax.atlassian.net/browse/OTTER-134) |
| #244 | chrisbendel | Test for validity of key | 2025-06-04 15:22:24 |  |
| #242 | Rod0352 | correct url for study in results approved email OTTO-187  | 2025-06-04 15:23:16 |  |
| #240 | stetradis | OTTER-204 - fix sms mfa error not showing on too many requests | 2025-06-04 15:24:17 | [OTTER-204](https://openstax.atlassian.net/browse/OTTER-204) |
| #249 | nathanstitt | Refactor approving results | 2025-06-04 18:31:25 |  |
| #250 | nathanstitt | replace researcher with submitted by | 2025-06-04 22:14:14 | [OTTER-200](https://openstax.atlassian.net/browse/OTTER-200) |
| #251 | nathanstitt | remove table heading text | 2025-06-04 22:14:27 | [OTTER-190](https://openstax.atlassian.net/browse/OTTER-190) |
| #252 | nathanstitt | remove "Study Results" title | 2025-06-04 22:38:02 | [OTTER-194](https://openstax.atlassian.net/browse/OTTER-194) |
| #253 | Rod0352 | OTTER-207 JOB-ERRORED popover positioning fix | 2025-06-04 23:39:07 | [OTTER-207](https://openstax.atlassian.net/browse/OTTER-207) |
| #254 | stetradis | OTTER-205 - fix reviewer key loop | 2025-06-05 14:25:43 | [OTTER-205](https://openstax.atlassian.net/browse/OTTER-205) |
| #248 | jbwilson8 | manage team layout updates and breadcrumb/ directory restructuring | 2025-06-05 17:58:34 | [OTTER-167](https://openstax.atlassian.net/browse/OTTER-167) |
| #255 | therealmarv | fix SI admin login | 2025-06-05 20:36:55 |  |


---

%!(EXTRA string=## [v0.0.4 - 2025-06-02](https://github.com/safeinsights/management-app/blob/main)

| PR | Author | Title | Merged Date | Tickets |
|----|--------|-------|-------------|---------|
| #233 | therealmarv | output to Sentry on production environment for warnings and errors | 2025-06-02 16:10:57 | [OTTER-175](https://openstax.atlassian.net/browse/OTTER-175) |
| #243 | nathanstitt | support releases based on tags | 2025-06-02 20:01:16 |  |


---

%!(EXTRA string=## [v0.0.3 - 2025-05-30](https://github.com/safeinsights/management-app/blob/main)

| PR   | Author      | Title                                                                 | Merged Date         | Tickets                                                                                                                   |
| ---- | ----------- | --------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| #197 | chrisbendel | Don't include studies pending review in ready/route                   | 2025-05-15 15:31:41 |                                                                                                                           |
| #209 | Rod0352     | accessibility related adjustments                                     | 2025-05-15 15:47:11 |                                                                                                                           |
| #206 | nathanstitt | set env var for containerizer to build                                | 2025-05-15 22:20:40 |                                                                                                                           |
| #214 | nathanstitt | log when not sending emails                                           | 2025-05-16 00:16:56 |                                                                                                                           |
| #202 | nathanstitt | document the different roles and their screens                        | 2025-05-16 02:36:02 |                                                                                                                           |
| #204 | stetradis   | OTTER 168 fix modal success view and focus error                      | 2025-05-16 14:26:46 | [OTTER-168](https://openstax.atlassian.net/browse/OTTER-168) [OTTER-186](https://openstax.atlassian.net/browse/OTTER-186) |
| #217 | nathanstitt | permit digits in org slug, simplify regex                             | 2025-05-19 14:23:41 |                                                                                                                           |
| #213 | Rod0352     | create a context to track user inactivity.                            | 2025-05-19 19:22:28 |                                                                                                                           |
| #218 | nathanstitt | fix api method to send results                                        | 2025-05-19 23:43:57 |                                                                                                                           |
| #215 | therealmarv | Small change README                                                   | 2025-05-20 14:39:44 |                                                                                                                           |
| #220 | Rod0352     | OTTO-189 patch - session activity timeout                             | 2025-05-21 16:49:23 |                                                                                                                           |
| #219 | nathanstitt | Sync user organizations with clerk after login; fix e2e specs         | 2025-05-21 19:37:15 |                                                                                                                           |
| #222 | nathanstitt | Update user management table styles                                   | 2025-05-21 20:33:15 |                                                                                                                           |
| #216 | stetradis   | Otter 181 - reviewer key                                              | 2025-05-22 15:09:36 | [OTTER-181](https://openstax.atlassian.net/browse/OTTER-181)                                                              |
| #225 | nathanstitt | add caching to GH actions                                             | 2025-05-22 16:51:08 |                                                                                                                           |
| #207 | therealmarv | Otter 178 org admin settings page                                     | 2025-05-22 17:36:53 | [OTTER-178](https://openstax.atlassian.net/browse/OTTER-178)                                                              |
| #221 | jbwilson8   | fix study result approve/rejected labels not showing up.              | 2025-05-22 17:37:04 | [OTTER-134](https://openstax.atlassian.net/browse/OTTER-134)                                                              |
| #224 | stetradis   | Adds feature for regenerating a reviewer key Otter 182                | 2025-05-22 18:12:06 | [OTTER-182](https://openstax.atlassian.net/browse/OTTER-182)                                                              |
| #226 | nathanstitt | check keys as part of server rendered layout                          | 2025-05-27 14:02:57 |                                                                                                                           |
| #228 | stetradis   | OTTER-202 fix: study rejection not working                            | 2025-05-27 15:01:39 | [OTTER-202](https://openstax.atlassian.net/browse/OTTER-202)                                                              |
| #229 | stetradis   | OTTER-196 and OTTER-197 - add breadcrumbs and remove welcome text     | 2025-05-27 15:13:27 | [OTTER-196](https://openstax.atlassian.net/browse/OTTER-196) [OTTER-197](https://openstax.atlassian.net/browse/OTTER-197) |
| #230 | nathanstitt | only attempt to fetch results if present                              | 2025-05-27 17:18:11 |                                                                                                                           |
| #227 | stetradis   | OTTER 182 - reviewer key ui fixes                                     | 2025-05-27 20:25:59 | [OTTER-182](https://openstax.atlassian.net/browse/OTTER-182)                                                              |
| #231 | stetradis   | OTTER-191 - fix table header background color                         | 2025-05-28 15:26:57 | [OTTER-191](https://openstax.atlassian.net/browse/OTTER-191)                                                              |
| #234 | nathanstitt | add explanation of debug scripts                                      | 2025-05-28 20:24:02 |                                                                                                                           |
| #235 | therealmarv | make mailgun errors more verbose and detailed                         | 2025-05-28 20:36:11 |                                                                                                                           |
| #237 | stetradis   | OTTER-193 update download button                                      | 2025-05-29 18:54:43 | [OTTER-193](https://openstax.atlassian.net/browse/OTTER-193)                                                              |
| #236 | stetradis   | OTTER-195 update study proposal validation                            | 2025-05-29 18:55:38 | [OTTER-195](https://openstax.atlassian.net/browse/OTTER-195)                                                              |
| #238 | nathanstitt | Allow SI admins to perform all actions, while respecting org switcher | 2025-05-30 16:31:25 | [OTTER-188](https://openstax.atlassian.net/browse/OTTER-188)                                                              |

---

## [20250519 - 2025-05-19](https://github.com/safeinsights/management-app/blob/b556599)

## [20250505 - 2025-050-05](https://github.com/safeinsights/management-app/blob/d899139)

## [20250424 - 2025-04-24](https://github.com/safeinsights/management-app/blob/07c622c)

## [Pilot release - 2025-03-31](https://github.com/safeinsights/management-app/blob/b5be9493d9d07de9c42839c781affc7f32bfc40e)

## [Alpha release - 2025-03-08](https://github.com/safeinsights/management-app/blob/b94ba41ccd1302f035414844ac316774ca6affd5)

## [First deployment - 2025-02-12](https://github.com/safeinsights/management-app/blob/8e94ebd)
))