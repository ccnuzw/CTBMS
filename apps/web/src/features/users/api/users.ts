import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserDto, CreateUserDto, UpdateUserDto } from '@packages/types';

// Ideally this should be an axios instance with base URL configured
const API_URL = 'http://localhost:3000';

export const useUsers = () => {
    return useQuery<UserDto[]>({
        queryKey: ['users'],
        queryFn: async () => {
            const res = await fetch(`${API_URL}/users`);
            if (!res.ok) throw new Error('Failed to fetch users');
            return res.json();
        },
    });
};

export const useCreateUser = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (newUser: CreateUserDto) => {
            const res = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser),
            });
            if (!res.ok) throw new Error('Failed to create user');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};

export const useUpdateUser = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateUserDto }) => {
            const res = await fetch(`${API_URL}/users/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to update user');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};

export const useDeleteUser = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`${API_URL}/users/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete user');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};
