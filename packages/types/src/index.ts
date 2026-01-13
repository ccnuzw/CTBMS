import { z } from 'zod';

export const UserSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(2),
    role: z.enum(['ADMIN', 'USER']),
});

export type User = z.infer<typeof UserSchema>;
