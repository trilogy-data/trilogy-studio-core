import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest'
import { SnowflakePatConnection } from './snowflake'
import { buildConnectionTree } from './helpers'

const jsonResponse = (status: number, body: any) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => body,
  }) as Response

const successBody = {
  resultSetMetaData: { rowType: [{ name: 'ONE', type: 'fixed', scale: 0 }] },
  data: [['1']],
}

function makeConnection(token = 'pat-secret', saveCredential = false) {
  const connection = new SnowflakePatConnection(
    'pat-conn',
    { account: 'acme-xy12345', username: '', token, warehouse: 'WH', role: 'ANALYST' },
    undefined,
    saveCredential,
  )
  // don't wait out the real polling interval in tests
  ;(connection as any).pollingInterval = 1
  return connection
}

describe('SnowflakePatConnection', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? jsonResponse(200, { statementHandle: 'handle-1' })
        : jsonResponse(200, successBody),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is a distinct connection type on the snowflake dialect', () => {
    const connection = makeConnection()
    expect(connection.type).toBe('snowflake-pat')
    expect(connection.query_type).toBe('snowflake')
  })

  it('sends the token as a programmatic access token bearer credential', async () => {
    const connection = makeConnection()
    const results = await connection.query_core('SELECT 1 AS ONE')

    expect(results.data).toEqual([{ ONE: 1 }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://acme-xy12345.snowflakecomputing.com/api/v2/statements/')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer pat-secret',
      'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
    })
    expect(JSON.parse(init.body)).toMatchObject({ warehouse: 'WH', role: 'ANALYST' })
  })

  it('verifies credentials once, then again only after they change', async () => {
    const connection = makeConnection()
    const submits = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').length

    await connection.connect()
    expect(submits()).toBe(1)
    await connection.connect()
    expect(submits()).toBe(1)

    connection.setSecret('rotated-token')
    expect(connection.changed).toBe(true)
    await connection.connect()
    expect(submits()).toBe(2)
    expect(fetchMock.mock.calls.at(-1)![1].headers.Authorization).toBe('Bearer rotated-token')
  })

  it('refuses to connect without a token and makes no request', async () => {
    const connection = makeConnection('')
    await expect(connection.connect()).rejects.toThrow(/No Snowflake access token/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains the likely causes when Snowflake rejects the token', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(401, { message: 'Programmatic access token is invalid.' }),
    )
    const connection = makeConnection()
    await expect(connection.connect()).rejects.toThrow(
      /Programmatic access token is invalid\..*expired.*network policy/,
    )
    // a failed check must not be remembered as verified
    await expect(connection.connect()).rejects.toThrow(/Authentication failed/)
  })

  it('never serialises the token itself', () => {
    expect(JSON.stringify(makeConnection('pat-secret', false).toJSON())).not.toContain('pat-secret')

    const saved = makeConnection('pat-secret', true).toJSON() as any
    expect(JSON.stringify(saved)).not.toContain('pat-secret')
    expect(saved.token).toBe('saved')
    expect(saved.type).toBe('snowflake-pat')
  })

  it('round-trips through fromJSON', () => {
    const json = makeConnection('pat-secret', true).toJSON() as any
    const restored = SnowflakePatConnection.fromJSON(json)

    expect(restored.type).toBe('snowflake-pat')
    expect(restored.id).toBe(json.id)
    expect(restored.config.account).toBe('acme-xy12345')
    expect(restored.config.role).toBe('ANALYST')
    expect(restored.saveCredential).toBe(true)
    // the 'saved' placeholder is what triggers credential-store rehydration
    expect(restored.getSecret()).toBe('saved')
    expect(restored.getSecretName()).toBe('trilogy-connection-snowflake-pat-pat-conn')
  })

  it('exposes account, token and credential-saving rows in the sidebar tree', () => {
    const connection = makeConnection()
    const tree = buildConnectionTree([connection], () => false, {}, {})
    const config = tree.filter((node) => node.indent === 1).map((node) => [node.type, node.name])

    expect(config).toContainEqual(['snowflake-account', 'Account'])
    expect(config).toContainEqual(['snowflake-private-key', 'Access Token'])
    expect(config).toContainEqual(['toggle-save-credential', 'Toggle Credential Saving'])
    expect(config.map(([type]) => type)).not.toContain('snowflake-username')
  })
})
