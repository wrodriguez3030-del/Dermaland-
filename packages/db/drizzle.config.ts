import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema/index.ts',
  out: '../../supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL ?? '',
  },
  verbose: true,
  strict: true,
} satisfies Config;
