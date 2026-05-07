// Standard API response envelope
export interface ApiResponse<T> {
  success: true
  data: T
  meta?: {
    page?: number
    pageSize?: number
    total?: number
  }
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResult<T> = ApiResponse<T> | ApiError

// Pagination
export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface DateRangeParams {
  from?: string // ISO date
  to?: string   // ISO date
}
