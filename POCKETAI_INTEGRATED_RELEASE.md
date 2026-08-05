# PocketAI Integrated release

This fork supplies only the PocketAI-owned OMP Integrated sidecar. It does not replace the user's independently installed `omp` command, publish OMP npm packages, or provide a fallback runtime.

## Repository and source policy

- Releases are accepted only from `trev222/oh-my-pi`.
- Start each PocketAI patch series from an exact, reviewed upstream commit.
- Keep PocketAI changes as a small commit series on top of that upstream commit. Never merge an unreviewed upstream branch into a release tag.
- Record the upstream base, PocketAI fork commit, release tag, and five asset digests in PocketAI's `apps/desktop/omp-integrated.lock.json`.
- A PocketAI application release must continue to stage the prior locked version if a candidate fork rebase or sidecar release fails any gate.

The release tag format is `pocketai-integrated-v<upstream-version>-<pocketai-revision>`, for example `pocketai-integrated-v17.2.9-1`. The tag must point at the exact reviewed fork commit.

## Required repository secrets

The `PocketAI Integrated release` workflow fails closed if a signing credential is absent.

macOS requires:

- `APPLE_CERTIFICATE_P12`: base64-encoded Developer ID Application P12.
- `APPLE_CERTIFICATE_PASSWORD`: P12 password.
- `APPLE_API_KEY_ID`: App Store Connect API key ID.
- `APPLE_API_ISSUER_ID`: App Store Connect issuer UUID.
- `APPLE_API_KEY`: base64-encoded App Store Connect P8 key.

Windows requires:

- `WINDOWS_SIGNING_PFX_BASE64`: base64-encoded Authenticode PFX.
- `WINDOWS_SIGNING_PFX_PASSWORD`: PFX password.

The optional repository variable `WINDOWS_SIGNING_TIMESTAMP_URL` overrides the default DigiCert RFC 3161 timestamp service.

Use GitHub environments or organization secret policy to restrict these values to repository administrators. Do not place signing material in the source tree, workflow artifacts, logs, or PocketAI's lock file.

## Release procedure

1. Rebase the PocketAI patch series onto the chosen upstream commit and review the complete `upstream..HEAD` diff.
2. Run `bun install --frozen-lockfile`, `bun check`, the PocketAI policy tests, and a real local sidecar probe.
3. Push the reviewed commit to `trev222/oh-my-pi`.
4. Create and push an annotated `pocketai-integrated-v<version>-<revision>` tag on that exact commit.
5. Wait for the `PocketAI Integrated release` workflow. It must build all five binaries, sign macOS and Windows, run full TypeScript/Rust validation, run the Integrated policy smoke on every native platform, generate `SHA256SUMS`, create GitHub build-provenance attestations, verify the exact candidate bytes on their native runners, and only then publish the release.
6. Verify the published release independently:

   ```sh
   gh release download pocketai-integrated-v17.2.9-1 --repo trev222/oh-my-pi --dir omp-release
   cd omp-release
   sha256sum -c SHA256SUMS
   gh attestation verify omp-linux-x64 --repo trev222/oh-my-pi
   ```

   Use `shasum -a 256` on macOS and `Get-FileHash -Algorithm SHA256` on Windows when GNU `sha256sum` is unavailable.

7. Generate PocketAI's schema-2 lock from the independently verified manifest,
   review the dry run, then write it atomically:

   ```sh
   node apps/desktop/scripts/update-omp-integrated-lock.mjs \
     --version 17.2.9-1 \
     --commit <full-pocketai-fork-sha> \
     --upstream-commit <full-upstream-base-sha> \
     --checksums /absolute/path/to/SHA256SUMS \
     --dry-run

   node apps/desktop/scripts/update-omp-integrated-lock.mjs \
     --version 17.2.9-1 \
     --commit <full-pocketai-fork-sha> \
     --upstream-commit <full-upstream-base-sha> \
     --checksums /absolute/path/to/SHA256SUMS
   ```

   The generator fixes the fork URL, upstream URL, release tag/URL, exact five
   targets, and provenance policy rather than accepting those as operator
   inputs. Run `npm run check:omp-integrated-lock --prefix apps/desktop`, parent
   packaging tests, and all platform gates before releasing PocketAI.

The workflow publishes these assets and no unsigned alternative:

- `omp-darwin-arm64`
- `omp-darwin-x64`
- `omp-linux-arm64`
- `omp-linux-x64`
- `omp-windows-x64.exe`
- `SHA256SUMS`

## Upgrade and rollback

Treat the PocketAI lock update as the atomic upgrade. Never replace assets under an existing release tag or reuse a PocketAI revision number.

To roll back, revert only the parent PocketAI lock update to the last known-good fork commit, release URL, and five digests, then rebuild PocketAI. Integrated configuration, credentials, and sessions remain under PocketAI's isolated application-data root, so changing the sidecar does not migrate or touch the user's native OMP files. If a new fork changes its session/config schema, add and test an explicit forward migration and a backward-compatible rollback path before updating the lock.

Do not delete the prior GitHub release while a shipped PocketAI version references it. A missing old asset makes clean install and rollback unreproducible.

## Failure handling

- Missing or invalid signing credentials: rotate or repair the repository secret; never publish unsigned replacements.
- Native policy smoke failure: fix or revert the fork patch. Do not weaken the policy assertions.
- Digest or provenance mismatch: discard the candidate tag and issue a new PocketAI revision after investigating the build inputs.
- Parent staging rejection: verify `forkRepository`, `releaseBaseUrl`, commit, target names, and SHA-256 values in `omp-integrated.lock.json`.
- OMP CLI failures are unrelated to this sidecar: diagnose the user's executable and native OMP configuration without reading, rewriting, or replacing it with Integrated.
