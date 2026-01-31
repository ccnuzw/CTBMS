import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavoritesState {
    favorites: Set<string>;
    addFavorite: (id: string) => void;
    removeFavorite: (id: string) => void;
    toggleFavorite: (id: string) => void;
    isFavorite: (id: string) => boolean;
    getFavoriteCount: () => number;
    clearFavorites: () => void;
}

export const useFavoritesStore = create<FavoritesState>()(
    persist(
        (set, get) => ({
            favorites: new Set<string>(),

            addFavorite: (id: string) => {
                set((state) => {
                    const newFavorites = new Set(state.favorites);
                    newFavorites.add(id);
                    return { favorites: newFavorites };
                });
            },

            removeFavorite: (id: string) => {
                set((state) => {
                    const newFavorites = new Set(state.favorites);
                    newFavorites.delete(id);
                    return { favorites: newFavorites };
                });
            },

            toggleFavorite: (id: string) => {
                const { favorites } = get();
                if (favorites.has(id)) {
                    get().removeFavorite(id);
                } else {
                    get().addFavorite(id);
                }
            },

            isFavorite: (id: string) => {
                return get().favorites.has(id);
            },

            getFavoriteCount: () => {
                return get().favorites.size;
            },

            clearFavorites: () => {
                set({ favorites: new Set() });
            },
        }),
        {
            name: 'knowledge-favorites',
            storage: {
                getItem: (name) => {
                    const str = localStorage.getItem(name);
                    if (!str) return null;
                    const parsed = JSON.parse(str);
                    return {
                        ...parsed,
                        state: {
                            ...parsed.state,
                            favorites: new Set(parsed.state.favorites || []),
                        },
                    };
                },
                setItem: (name, value) => {
                    const toStore = {
                        ...value,
                        state: {
                            ...value.state,
                            favorites: Array.from(value.state.favorites),
                        },
                    };
                    localStorage.setItem(name, JSON.stringify(toStore));
                },
                removeItem: (name) => localStorage.removeItem(name),
            },
        }
    )
);
