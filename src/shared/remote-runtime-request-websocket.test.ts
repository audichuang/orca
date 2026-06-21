import type { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { generateKeyPair, publicKeyToBase64 } from './e2ee-crypto'
import { openRemoteRuntimeWebSocket } from './remote-runtime-request-websocket'

describe('openRemoteRuntimeWebSocket', () => {
  it('detaches Orca callback listeners when cleaned up', () => {
    const keyPair = generateKeyPair()
    const opened = openRemoteRuntimeWebSocket(
      {
        v: 2,
        endpoint: 'ws://127.0.0.1:1',
        deviceToken: 'device-token',
        publicKeyB64: publicKeyToBase64(keyPair.publicKey)
      },
      {
        onClose: vi.fn(),
        onError: vi.fn(),
        onTextFrame: vi.fn()
      }
    )
    if (!opened.ok) {
      throw opened.error
    }

    const socketEvents = opened.socket.ws as unknown as EventEmitter
    expect(socketEvents.listenerCount('open')).toBe(1)
    expect(socketEvents.listenerCount('close')).toBe(1)
    expect(socketEvents.listenerCount('message')).toBe(1)
    expect(socketEvents.listenerCount('error')).toBe(1)

    opened.socket.cleanup()
    opened.socket.cleanup()

    expect(socketEvents.listenerCount('open')).toBe(0)
    expect(socketEvents.listenerCount('close')).toBe(0)
    expect(socketEvents.listenerCount('message')).toBe(0)
    expect(socketEvents.listenerCount('error')).toBe(1)
    expect(() => socketEvents.emit('error', new Error('late socket error'))).not.toThrow()
    opened.socket.ws.terminate()
  })

  it('includes transport error details when the socket cannot connect', () => {
    const keyPair = generateKeyPair()
    const onError = vi.fn()
    const opened = openRemoteRuntimeWebSocket(
      {
        v: 2,
        endpoint: 'ws://127.0.0.1:1',
        deviceToken: 'device-token',
        publicKeyB64: publicKeyToBase64(keyPair.publicKey)
      },
      {
        onClose: vi.fn(),
        onError,
        onTextFrame: vi.fn()
      }
    )
    if (!opened.ok) {
      throw opened.error
    }

    const socketEvents = opened.socket.ws as unknown as EventEmitter
    socketEvents.emit(
      'error',
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), {
        code: 'ECONNREFUSED'
      })
    )

    expect(onError).toHaveBeenCalledWith(
      opened.socket.ws,
      expect.objectContaining({
        code: 'remote_runtime_unavailable',
        message:
          'Could not connect to the remote Orca runtime at ws://127.0.0.1:1. Transport error: connect ECONNREFUSED 127.0.0.1:1.'
      })
    )

    opened.socket.cleanup()
    opened.socket.ws.terminate()
  })
})
