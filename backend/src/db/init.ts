// Create the SQLite database file and all tables. Safe to run repeatedly.
import { DB_FILE, db, initSchema } from "./database.js";

initSchema();
console.log(`\x1b[32m✓ Database ready\x1b[0m at ${DB_FILE}`);
db.close();
