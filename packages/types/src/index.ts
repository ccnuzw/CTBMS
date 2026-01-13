import { z } from 'zod';

export const UserSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(2).optional().nullable(),
    role: z.enum(['ADMIN', 'USER']),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const CreateUserSchema = UserSchema.pick({
    email: true,
    name: true,
    role: true,
});


export const UpdateUserSchema = CreateUserSchema.partial();

export type UserDto = z.infer<typeof UserSchema>;
export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;


export * from './modules/market-info.js';
