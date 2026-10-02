import { pool } from '../connection';
import { VoiceRoom, CreateVoiceRoomInput, UpdateVoiceRoomInput } from '../../../shared/src/types/voiceRoom';

export class VoiceRoomDatabase {
  static async findAll(): Promise<VoiceRoom[]> {
    const query = 'SELECT * FROM voice_rooms WHERE is_active = true ORDER BY name';
    const result = await pool.query(query);
    return result.rows;
  }

  static async findById(id: number): Promise<VoiceRoom | null> {
    const query = 'SELECT * FROM voice_rooms WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  static async create(roomData: CreateVoiceRoomInput): Promise<VoiceRoom> {
    const query = `
      INSERT INTO voice_rooms (name, description, max_participants, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await pool.query(query, [
      roomData.name,
      roomData.description || null,
      roomData.max_participants || 10,
      roomData.is_active !== undefined ? roomData.is_active : true
    ]);
    return result.rows[0];
  }

  static async update(id: number, roomData: UpdateVoiceRoomInput): Promise<VoiceRoom> {
    const fields = [];
    const values = [];
    let index = 1;
    
    if (roomData.name !== undefined) {
      fields.push(`name = $${index}`);
      values.push(roomData.name);
      index++;
    }
    
    if (roomData.description !== undefined) {
      fields.push(`description = $${index}`);
      values.push(roomData.description);
      index++;
    }
    
    if (roomData.max_participants !== undefined) {
      fields.push(`max_participants = $${index}`);
      values.push(roomData.max_participants);
      index++;
    }
    
    if (roomData.is_active !== undefined) {
      fields.push(`is_active = $${index}`);
      values.push(roomData.is_active);
      index++;
    }
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    values.push(id);
    
    const query = `
      UPDATE voice_rooms 
      SET ${fields.join(', ')} 
      WHERE id = $${index}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM voice_rooms WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rowCount > 0;
  }
}