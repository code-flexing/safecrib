import { describe, expect, it } from 'vitest';
import { AuthController } from './auth.controller.js';

describe('AuthController', () => {
  it('includes profile picture, display name and username in the current user payload', () => {
    const controller = new AuthController({} as never);

    const result = controller.me({
      id: 'user-123',
      email: 'student@example.com',
      role: 'STUDENT',
      displayName: 'Amina Okafor',
      username: 'amina_12345',
      profilePicture: 'avatar-media-id',
      emailVerified: true,
    });

    expect(result).toMatchObject({
      id: 'user-123',
      email: 'student@example.com',
      role: 'STUDENT',
      displayName: 'Amina Okafor',
      username: 'amina_12345',
      profilePicture: 'avatar-media-id',
    });
  });
});
