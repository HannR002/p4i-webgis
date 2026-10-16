This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

Flood-risk architecture, security, migration, import, and deployment guidance is documented in [`docs/flood-analysis-architecture.md`](docs/flood-analysis-architecture.md).

## Getting Started

Use **Node.js 22.23.3 or a later Node 22 patch** (`.node-version` selects the
verified version). Node 20/24/26 are not this project's supported runtime.
`@types/node` targets Node 22. Install the committed lockfile with `npm ci`
(verified with npm 10.9.9), then run the development server:

```bash
npm run dev
```

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before
review. Framework versions are aligned; Vite 7 is explicitly pinned for Vitest
4 compatibility. For dependency maintenance, npm 11.21.1 was needed to resolve
the Vitest major upgrade after npm 10's peer resolver failed; ordinary clean
installs use the resulting lockfile. See the
[Phase 11 security report](docs/PHASE_11_DEPENDENCY_SECURITY_REMEDIATION.md)
for unresolved advisories and exact verification evidence. Passing local checks
does not establish Hostinger compatibility or authorize production deployment.

Phase 12 removes the dormant Earth Engine SDK from the application installation.
The legacy flood endpoint remains unavailable; credentials cannot activate it.
See the [current isolation and residual-risk report](docs/PHASE_12_RESIDUAL_DEPENDENCY_RESOLUTION.md)
before any future GEE adapter work. Historical code is preserved as a non-runtime reference.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
