export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, 403)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409)
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMITED', message, 429)
  }
}

export class TeslaApiError extends AppError {
  constructor(message: string, public readonly teslaCode?: string) {
    super('TESLA_API_ERROR', message, 502)
  }
}

export class VehicleAsleepError extends AppError {
  constructor() {
    super('VEHICLE_ASLEEP', 'Vehicle is asleep. Wake it up explicitly before sending commands.', 409)
  }
}
