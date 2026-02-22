export type TimeRange = 'ALL' | '24H' | '7D' | '30D';
export type SentimentFilter = 'ALL' | 'positive' | 'negative';
export type SortOption = 'time_desc' | 'time_asc' | 'relevance';

export const EXPANDED_KEY = 'universal_search_expanded';
export const SEARCH_HISTORY_KEY = 'universal_search_history';
export const SAVED_SEARCHES_KEY = 'universal_saved_searches';

export interface SavedSearch {
    id: string;
    name: string;
    keyword: string;
    dateRange: TimeRange;
    sentiment: SentimentFilter;
    createdAt: number;
}
