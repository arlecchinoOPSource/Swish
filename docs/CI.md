# CI access and checks

Core and Swish are separate private repositories. Swish uses an owner-authorized read-only deploy key registered on Core and stored as the `CORE_READ_KEY` Actions secret in Swish. The key permits reading Core only, not pushing or accessing other repositories. The checkout action uses the key for the exact commit recorded in the submodule and removes credentials after checkout (`persist-credentials: false`). Never print or commit it.

The checkout action includes GitHub in its SSH known hosts. Fork pull requests do not receive secrets and therefore cannot run this private consumer check automatically; review and run trusted contributions in an authorized branch without exposing secrets to untrusted code.

Checks: strict TypeScript, production Vite build, and Core's existing contract tests. Native build, UI, storage, and installer checks must be added as their implementation issues land. These initial checks do not certify v1 completion.

To rotate: create a new read-only Core deploy key, update the Swish secret, verify a workflow run, then remove the previous Core key. Local developers use their own GitHub authentication.
