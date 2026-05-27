# Third-Party Licenses

The Management App is distributed under the [GNU Affero General Public License v3.0](LICENSE). It includes third-party software covered by separate licenses. This document lists those components, identifies the obligations they create when this application is distributed, and points to the corresponding license texts.

The app's own AGPL-3.0 license is compatible with all third-party licenses listed below. Inclusion of LGPL-licensed components does not impose additional obligations on users of the app's source code beyond those already required by AGPL-3.0.

## Components requiring distribution-time notice

### libvips (LGPL-3.0-or-later)

- **Where it comes from:** Next.js declares `sharp` as an `optionalDependency`, and `sharp` in turn depends on `@img/sharp-libvips-<platform>` packages, which ship prebuilt `libvips` shared-library binaries (`.so` / `.dylib` / `.dll`) in `node_modules/@img/sharp-libvips-<platform>/lib/`.
- **Upstream project:** https://github.com/libvips/libvips
- **License text:** [`licenses/LGPL-3.0.txt`](licenses/LGPL-3.0.txt) (which incorporates [`licenses/GPL-3.0.txt`](licenses/GPL-3.0.txt) by reference)
- **How it is linked:** dynamically. `sharp` loads `libvips` at runtime via Node.js's native-addon mechanism. The shared library remains a separate, replaceable file in the distributed image; nothing about libvips is statically compiled into the application code.
- **How to exercise LGPL rights:** a recipient who wishes to run a modified version of `libvips` may replace the shared-library file shipped at `node_modules/@img/sharp-libvips-<platform>/lib/libvips-cpp.<version>.<ext>` with a compatible build of their choice. The `sharp` loader will use whatever `libvips` is found at that path.
- **Source code availability:** the complete corresponding source code for the version of `libvips` distributed with this application is available at https://github.com/libvips/libvips. Tagged source releases corresponding to the binary version included in `@img/sharp-libvips-<platform>/versions.json` are downloadable from the upstream releases page. On written request to the address in [`AUTHORS`](AUTHORS), we will additionally provide a physical copy of the corresponding source for a charge no more than the cost of physically performing source distribution.

### sharp (Apache-2.0)

- **Upstream project:** https://github.com/lovell/sharp
- **License text:** standard Apache-2.0 (also reproduced in `node_modules/@img/sharp-<platform>/LICENSE` inside the distributed image).
- Apache-2.0 requires only attribution and inclusion of the license text; both are satisfied by the LICENSE file inside the shipped npm package.

## Other dependencies

The application bundles many additional MIT, BSD, ISC, and Apache-2.0 licensed packages from the npm registry. The license text for each of these is included in the corresponding subdirectory of `node_modules/` in the distributed image, in accordance with each package's notice requirements. A complete machine-readable inventory can be regenerated at any time with:

```
pnpm licenses list --prod --json > THIRD_PARTY_INVENTORY.json
```

## Reporting issues

If you believe this distribution is missing required notice, source-code-availability text, or any other compliance artifact for a component above, please open an issue at https://github.com/safeinsights/management-app or contact the maintainers listed in [`AUTHORS`](AUTHORS).
