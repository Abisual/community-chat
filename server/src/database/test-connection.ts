// Test script to verify database connection and basic functionality
import { pool } from './connection';

async function testDatabase() {
  try {
    console.log('Testing database connection...');
    
    const client = await pool.connect();
    console.log('✓ Database connection successful');
    
    // Test a simple query
    const result = await client.query('SELECT NOW() as time');
    console.log('✓ Query executed successfully:', result.rows[0].time);
    
    client.release();
    
    console.log('✓ All database tests passed');
  } catch (error) {
    console.error('✗ Database test failed:', error);
    process.exit(1);
  }
}

testDatabase();