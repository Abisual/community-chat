import { pool, testConnection } from './connection';

// Initialize database connections and run migrations
export const connectToDatabase = async () => {
  try {
    await testConnection();
    console.log('Database connection established successfully');
    
    // Run migrations here
    // This would be implemented in later milestones for actual migrations
    return pool;
  } catch (error) {
    console.error('Failed to initialize database connection:', error);
    throw error;
  }
};