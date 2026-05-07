export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true as const, data, ...(meta ? { meta } : {}) }
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return {
    success: true as const,
    data,
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  }
}
