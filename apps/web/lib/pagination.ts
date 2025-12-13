import { useCallback } from "react";

export const PAGE_SIZE_OPTS = [5, 10, 25] as const;

export interface Pagination {
  page?: number;
  size?: number;
}

export interface Meta {
  has_next: boolean;
  has_previous: boolean;
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
}

export function usePagination<T extends Pagination>(
  params: T,
  setParams: (updates: Partial<T>) => void,
) {
  const onPaginationChange = useCallback(
    (pagination: Pagination) => setParams(pagination as Partial<T>),
    [setParams],
  );

  return {
    // Props ready for ServerDataGrid component
    paginationState: {
      page: params.page, // 1-based page number
      size: params.size,
    },
    // The handler that talks to DataGrid's event model
    onPaginationChange,
  };
}
