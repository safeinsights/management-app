# Container image pinning for code environments

**Decision:** code environment URLs may be a plain `registry/repo:tag`. The app does not require a
sha256 digest. Harbor's tag immutability rules keep a tag pointing at the same image.

## History

- **#1225 (SHRMP-301), merged 2026-10-26:** required every new or edited code environment to pin its image
  as `<url>@sha256:<64 hex>`, so the image couldn't change under a reused tag. The form gained a
  separate "Image digest" field, because Harbor shows only a truncated digest and has no copy button
  for the full reference. `dockerImageRefSchema` rejected unpinned references on the server, and
  editing a legacy unpinned environment was blocked until a digest was added.
- **Reverted:** the required digest field blocked work from continuing. Harbor can enforce tags as
  immutable, which gives the same guarantee as pinning the digest: the same image is pulled every time
  for a given URL and tag. It also asks much less of the admin filling in the form.

## Consequences

- The tag-stability guarantee now lives in Harbor configuration, not in the app. A Harbor project
  that hosts code environment images needs a tag immutability rule covering those repositories.
- Images from registries without that rule (e.g. Docker Hub) can still change under a reused tag. Use
  a digest-pinned URL for those. The app still accepts `repo:tag@sha256:…`.
- No data changed either way. URLs saved with a digest while #1225 was live keep it and still pull.
