# Database Package

- Prisma schema: `packages/database/prisma/schema.prisma`
- Scope currently includes auth models for Auth.js integration.
- Create local migration: `pnpm --filter @forgetful-fish/database run db:migrate`
- Deploy migrations in production: `pnpm --filter @forgetful-fish/database run db:migrate:deploy`
