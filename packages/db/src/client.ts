import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error('SUPABASE_DB_URL is required');
}

const queryClient = postgres(connectionString, { prepare: false });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
