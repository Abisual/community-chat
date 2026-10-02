export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  username: string;
  password_hash: string;
}

export interface UpdateUserInput {
  username?: string;
  password_hash?: string;
}