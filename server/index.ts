import { resolve } from 'node:path';
import { createApp } from './app';
import { openDatabase } from './db';

const port = Number(process.env.PORT ?? 8787);
const dbFile = process.env.DATABASE_FILE ?? resolve('data/mappzy.db');
const production = process.env.NODE_ENV === 'production';

const db = openDatabase(dbFile);
const app = createApp(db, { staticDir: production ? resolve('dist') : undefined });

app.listen(port, () => {
  console.log(`mappzy API: http://localhost:${port} (baza: ${dbFile})`);
});
