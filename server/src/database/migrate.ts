import { pool } from './connection';
import * as fs from 'fs';
import * as path from 'path';

// Migration utility to run database migrations
export const runMigrations = async () => {
  try {
    console.log('Running database migrations...');
    
    // Get all migration files sorted by name
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.ts'))
      .sort();
    
    for (const fileName of migrationFiles) {
      console.log(`Running migration: ${fileName}`);
      const migration = require(path.join(migrationsDir, fileName));
      
      if (typeof migration.up === 'function') {
        await migration.up(pool);
      } else {
        console.warn(`Migration ${fileName} does not have an up function`);
      }
    }
    
    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
};