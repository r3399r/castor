export const genPagination = (total: number, limit: number, offset: number) => {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    totalPages,
  };
};
