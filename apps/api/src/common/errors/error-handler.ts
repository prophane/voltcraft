import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from './app-error.js'

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    // Zod validation errors
    if (error instanceof ZodError) {
      return reply.status(422).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.flatten().fieldErrors,
        },
      })
    }

    // Known app errors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      })
    }

    // Fastify built-in errors (e.g. 404 route not found)
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: 'HTTP_ERROR',
          message: error.message,
        },
      })
    }

    // Unexpected errors — log and return generic 500
    app.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    })
  })
}
