import { useCallback } from "react";

export const PAGE_SIZE_OPTS = [5, 10, 25] as const;

export interface Pagination {
  page?: number;
  pageSize?: number;
}

export interface Meta {
  has_next: boolean;
  has_previous: boolean;
  page: number;
  pageSize: number;
  total_items: number;
  total_pages: number;
}

export function usePagination(
  params: Pagination,
  setParams: (updates: Partial<Pagination>) => void,
) {
  const onPaginationChange = useCallback(
    (pagination: Pagination) => setParams(pagination as Partial<Pagination>),
    [setParams],
  );

  return {
    // Props ready for ServerDataGrid component
    paginationState: {
      page: params.page, // 1-based page number
      size: params.pageSize, // number of items per page
    },
    // The handler that talks to DataGrid's event model
    onPaginationChange,
  };
}
