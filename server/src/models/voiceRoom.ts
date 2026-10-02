// Voice room model definition for database operations
export interface VoiceRoom {
  id: number;
  name: string;
  description: string;
  max_participants: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVoiceRoomInput {
  name: string;
  description?: string;
  max_participants?: number;
  is_active?: boolean;
}

export interface UpdateVoiceRoomInput {
  name?: string;
  description?: string;
  max_participants?: number;
  is_active?: boolean;
}