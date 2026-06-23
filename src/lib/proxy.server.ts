import { Mochi, type MochiWsData } from 'mochi-framework';
import type { Server, ServerWebSocket } from 'bun';
import { getInstance } from './db.server.ts';

/** URL prefix under which every instance's code-server is proxied. */
export const PROXY_PREFIX = '/p';

/**
 * Route key for the WebSocket relay. Sockets are upgraded from the `fetch`
 * fallback with `data.__mochiRoutePattern` set to this value so Mochi's shared
 * websocket dispatcher routes their open/message/close to `proxyWsRelay`. It
 * must equal the route key under which `proxyWsRelay` is registered.
 */
export const PROXY_WS_PATTERN = '/__dcm_proxy_ws';

/** Same-origin path that loads an instance's IDE through the proxy. */
export function proxyPathFor(id: string): string {
  return `${PROXY_PREFIX}/${id}/`;
}

/** Split `/p/<id>/<rest>` into its id and the upstream path (`''` for the bare form). */
function parse(pathname: string): { id: string; rest: string } | null {
  if (pathname !== PROXY_PREFIX && !pathname.startsWith(PROXY_PREFIX + '/')) return null;
  const after = pathname.slice(PROXY_PREFIX.length + 1); // strip "/p/"
  if (!after) return null;
  const slash = after.indexOf('/');
  if (slash === -1) return { id: after, rest: '' };
  return { id: after.slice(0, slash), rest: after.slice(slash) };
}

/** Loopback origin of a running instance's published code-server port, or null. */
function upstreamPort(id: string): number | null {
  const row = getInstance(id);
  if (!row || row.status !== 'running') return null;
  return row.host_port;
}

/** A WebSocket frame in either direction — text or a binary buffer. */
type Frame = string | Buffer;

/** Forward a relayed frame, casting past the DOM `send` overload's strict typing. */
function sendFrame(socket: { send: (data: never) => unknown }, frame: Frame): void {
  socket.send(frame as never);
}

/** Relay state carried on each proxied WebSocket (the `user` slot of MochiWsData). */
interface RelayState {
  upstreamWsUrl: string;
  client?: WebSocket;
  /** Frames received from the browser before the upstream socket is open. */
  pending: Frame[];
}

/** Close codes an application is allowed to pass to `.close()`; others throw. */
function safeClose(ws: { close: (code?: number, reason?: string) => void }, code: number, reason: string): void {
  try {
    if (code === 1000 || (code >= 3000 && code <= 4999)) ws.close(code, reason);
    else ws.close();
  } catch {
    /* already closed */
  }
}

/**
 * Proxy a request to the right instance's code-server, or return `undefined`
 * for non-proxy paths so Mochi can 404. Auth is enforced upstream by the global
 * `basicAuth` middleware, which wraps this fallback. Handles three cases:
 *  - bare `/p/<id>` → 302 to `/p/<id>/` (code-server emits relative URLs).
 *  - WebSocket upgrade → hand off to Bun + the `proxyWsRelay` dispatcher.
 *  - everything else → stream an HTTP request to the loopback code-server port.
 */
export async function handleProxyRequest(
  req: Request,
  server: Server<undefined>,
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const parsed = parse(url.pathname);
  if (!parsed) return undefined;

  const port = upstreamPort(parsed.id);
  if (port === null) return new Response('Instance not running', { status: 502 });

  // code-server's HTML uses relative URLs, so the IDE must load at "/p/<id>/".
  if (parsed.rest === '') {
    return new Response(null, {
      status: 302,
      headers: { Location: `${PROXY_PREFIX}/${parsed.id}/${url.search}` },
    });
  }

  // WebSocket upgrade (terminal, file-sync, language servers).
  if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    const data: MochiWsData<RelayState> = {
      __mochiRoutePattern: PROXY_WS_PATTERN,
      __mochiOpenedAt: performance.now(),
      __mochiPath: url.pathname,
      user: {
        upstreamWsUrl: `ws://127.0.0.1:${port}${parsed.rest}${url.search}`,
        pending: [],
      },
    };
    // Bun's Server is typed with a fixed WebSocketData; cast to hand it our
    // relay-tagged data, matching how Mochi performs its own upgrades.
    const ok = (
      server as unknown as { upgrade: (req: Request, opts: { data: MochiWsData<RelayState> }) => boolean }
    ).upgrade(req, { data });
    if (!ok) return new Response('WebSocket upgrade failed', { status: 426 });
    // The 101 was already sent by Bun; this sentinel is ignored but keeps the
    // Mochi fetch chain (which reads `response.status`) happy.
    return new Response(null, { status: 101 });
  }

  // Plain HTTP: stream through to the upstream, stripping the /p/<id> prefix.
  const headers = new Headers(req.headers);
  headers.set('host', `127.0.0.1:${port}`);
  headers.delete('accept-encoding'); // ask for an unencoded body so we can stream it verbatim
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const upstream = await fetch(`http://127.0.0.1:${port}${parsed.rest}${url.search}`, {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    redirect: 'manual',
    // @ts-expect-error Bun streams request bodies with duplex: 'half'.
    duplex: 'half',
  });

  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete('content-encoding'); // body is already decoded by fetch
  resHeaders.delete('transfer-encoding'); // Bun re-frames the streamed body
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

/**
 * WebSocket relay handlers, dispatched by Mochi for sockets tagged with
 * `PROXY_WS_PATTERN`. The actual upgrade happens in `handleProxyRequest`; the
 * `upgrade` hook here only guards the sentinel route from direct navigation.
 */
export const proxyWsRelay = Mochi.ws<RelayState>({
  upgrade: () => false,
  open(ws: ServerWebSocket<MochiWsData<RelayState>>) {
    const state = ws.data.user;
    const client = new WebSocket(state.upstreamWsUrl);
    client.binaryType = 'arraybuffer';
    state.client = client;

    client.onopen = () => {
      for (const frame of state.pending) sendFrame(client, frame);
      state.pending = [];
    };
    client.onmessage = (event) => {
      try {
        ws.send(event.data);
      } catch {
        /* browser socket closed */
      }
    };
    client.onclose = (event) => safeClose(ws, event.code, event.reason);
    client.onerror = () => safeClose(ws, 1011, 'upstream error');
  },
  message(ws: ServerWebSocket<MochiWsData<RelayState>>, message) {
    const state = ws.data.user;
    if (state.client && state.client.readyState === WebSocket.OPEN) sendFrame(state.client, message);
    else state.pending.push(message);
  },
  close(ws: ServerWebSocket<MochiWsData<RelayState>>) {
    safeClose(ws.data.user.client ?? { close: () => {} }, 1000, '');
  },
});
