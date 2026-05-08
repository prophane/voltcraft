import { beforeEach, describe, expect, it, vi } from 'vitest'

const fsMocks = vi.hoisted(() => ({
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

const envMock = vi.hoisted(() => ({
  appConfigPath: '/tmp/voltcraft/runtime.env',
  env: {
    TESLAMATE_DB_NAME: 'teslamate',
    TESLAMATE_DB_USER: 'teslamate',
    TESLAMATE_DB_PASSWORD: 'initial-password',
    TESLAMATE_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    TESLAMATE_GRAFANA_USER: 'admin',
    TESLAMATE_GRAFANA_PASSWORD: 'grafana-password',
    TESLAMATE_PORT: 4000,
    TESLAMATE_GRAFANA_PORT: 3002,
    TESLAMATE_BACKEND_ONLY: true,
  },
}))

vi.mock('node:fs/promises', () => fsMocks)
vi.mock('../../src/config/env.js', () => envMock)

describe('persistTeslamateConfig', () => {
  beforeEach(() => {
    fsMocks.access.mockReset()
    fsMocks.readFile.mockReset()
    fsMocks.writeFile.mockReset()

    fsMocks.access.mockResolvedValue(undefined)
    fsMocks.readFile.mockResolvedValue('TESLAMATE_DB_NAME=old-name\nOTHER=value\n')
    fsMocks.writeFile.mockResolvedValue(undefined)
  })

  it('writes the TeslaMate runtime config and updates in-memory env values', async () => {
    const { persistTeslamateConfig } = await import('../../src/config/teslamate-config.js')

    const result = await persistTeslamateConfig({
      dbName: 'teslamate-prod',
      dbUser: 'tm_reader',
      dbPassword: 'new-secret-password',
      encryptionKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      grafanaUser: 'grafana',
      grafanaPassword: 'another-secret',
      port: 4010,
      grafanaPort: 3010,
      backendOnly: false,
    })

    expect(result).toEqual({
      envPath: '/tmp/voltcraft/runtime.env',
      persistedToFile: true,
    })
    expect(fsMocks.writeFile).toHaveBeenCalledTimes(1)
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '/tmp/voltcraft/runtime.env',
      expect.stringContaining('TESLAMATE_DB_NAME=teslamate-prod'),
      'utf8',
    )
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '/tmp/voltcraft/runtime.env',
      expect.stringContaining('TESLAMATE_DB_USER=tm_reader'),
      'utf8',
    )
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '/tmp/voltcraft/runtime.env',
      expect.stringContaining('TESLAMATE_DB_PASSWORD=new-secret-password'),
      'utf8',
    )
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '/tmp/voltcraft/runtime.env',
      expect.stringContaining('TESLAMATE_BACKEND_ONLY=false'),
      'utf8',
    )
    expect(envMock.env.TESLAMATE_DB_NAME).toBe('teslamate-prod')
    expect(envMock.env.TESLAMATE_DB_USER).toBe('tm_reader')
    expect(envMock.env.TESLAMATE_DB_PASSWORD).toBe('new-secret-password')
    expect(envMock.env.TESLAMATE_PORT).toBe(4010)
    expect(envMock.env.TESLAMATE_GRAFANA_PORT).toBe(3010)
    expect(envMock.env.TESLAMATE_BACKEND_ONLY).toBe(false)
  })
})