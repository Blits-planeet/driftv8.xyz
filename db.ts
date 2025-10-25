import { drizzle } from 'drizzle-orm/neon-serverless';
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from '../shared/schema';

// Configure Neon for WebSocket support
neonConfig.webSocketConstructor = ws;

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db && process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  }
  return db;
}
