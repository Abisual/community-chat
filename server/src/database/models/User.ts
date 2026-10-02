import { pool } from '../connection';
import { User, CreateUserInput, UpdateUserInput } from '../../../shared/src/types/user';

export class UserDatabase {
  static async findById(id: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  static async findByUsername(username: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE username = $1';
    const result = await pool.query(query, [username]);
    return result.rows[0] || null;
  }

  static async create(userData: CreateUserInput): Promise<User> {
    const query = `
      INSERT INTO users (username, password_hash)
      VALUES ($1, $2)
      RETURNING *
    `;
    const result = await pool.query(query, [userData.username, userData.password_hash]);
    return result.rows[0];
  }

  static async update(id: number, userData: UpdateUserInput): Promise<User> {
    const fields = [];
    const values = [];
    let index = 1;
    
    if (userData.username !== undefined) {
      fields.push(`username = $${index}`);
      values.push(userData.username);
      index++;
    }
    
    if (userData.password_hash !== undefined) {
      fields.push(`password_hash = $${index}`);
      values.push(userData.password_hash);
      index++;
    }
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    values.push(id);
    
    const query = `
      UPDATE users 
      SET ${fields.join(', ')} 
      WHERE id = $${index}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rowCount > 0;
  }
}