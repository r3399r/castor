export type PaginationParams = {
  limit?: string;
  offset?: string;
};

export type Paginate<T> = {
  data: T[];
  paginate: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
