import { DurableObject } from 'cloudflare:workers';
import { Chess } from 'chess.js';

interface Env {
  GAME_ROOMS: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
}

type PlayerColor = 'w' | 'b';
type ClientMessage =
  | { type: 'join'; name?: string }
  | { type: 'move'; from: string; to: string; promotion?: string }
  | { type: 'resign' };

type StoredGame = { fen: string; pgn: string; result: string | null };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!/^[A-Z0-9]{5,8}$/.test(room)) return new Response('Invalid room code', { status: 400 });
      const id = env.GAME_ROOMS.idFromName(room);
      return env.GAME_ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class GameRoom extends DurableObject<Env> {
  private chess: Chess;
  private gameResult: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.chess = new Chess();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    await this.restore();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ color: null, name: 'Guest' });
    this.send(server, { type: 'joined', color: null, fen: this.chess.fen(), pgn: this.chess.pgn(), result: this.result() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.restore();
    let message: ClientMessage;
    try {
      if (typeof raw !== 'string' || raw.length > 1024) throw new Error('Message too large');
      message = JSON.parse(raw) as ClientMessage;
    } catch { this.send(socket, { type: 'error', message: 'Invalid message' }); return; }

    const attachment = (socket.deserializeAttachment() || { color: null, name: 'Guest' }) as { color: PlayerColor | null; name: string };
    if (message.type === 'join') {
      const assigned = this.assignColor(socket);
      const name = typeof message.name === 'string' ? message.name.trim().slice(0, 20) : '';
      socket.serializeAttachment({ color: assigned, name: name || 'Player' });
      this.broadcast({ type: 'state', fen: this.chess.fen(), pgn: this.chess.pgn(), result: this.result(), players: this.players() });
      this.send(socket, { type: 'joined', color: assigned, fen: this.chess.fen(), pgn: this.chess.pgn(), result: this.result() });
      return;
    }

    if (message.type === 'move') {
      if (!attachment.color) { this.send(socket, { type: 'error', message: 'Join the game first.' }); return; }
      if (attachment.color !== this.chess.turn()) { this.send(socket, { type: 'error', message: 'It is not your turn.' }); return; }
      try {
        this.chess.move({ from: message.from, to: message.to, promotion: message.promotion || 'q' });
      } catch { this.send(socket, { type: 'error', message: 'That move is not legal.' }); return; }
      await this.save();
      this.broadcast({ type: 'state', fen: this.chess.fen(), pgn: this.chess.pgn(), result: this.result(), players: this.players() });
      return;
    }

    if (message.type === 'resign' && attachment.color) {
      this.gameResult = attachment.color === 'w' ? '0-1' : '1-0';
      await this.save();
      this.broadcast({ type: 'state', fen: this.chess.fen(), pgn: this.chess.pgn(), result: this.result(), players: this.players() });
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.restore();
    try { socket.close(); } catch { /* already closed */ }
    this.broadcast({ type: 'state', fen: this.chess.fen(), pgn: this.chess.pgn(), result: this.result(), players: this.players() });
  }

  private assignColor(socket: WebSocket): PlayerColor | null {
    const occupied = new Set(this.ctx.getWebSockets().filter(ws => ws !== socket).map(ws => (ws.deserializeAttachment() as { color?: PlayerColor } | null)?.color));
    if (!occupied.has('w')) return 'w';
    if (!occupied.has('b')) return 'b';
    return null;
  }

  private players(): { white: string | null; black: string | null } {
    const players: { white: string | null; black: string | null } = { white: null, black: null };
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as { color?: PlayerColor; name?: string } | null;
      if (a?.color === 'w') players.white = a.name || 'White';
      if (a?.color === 'b') players.black = a.name || 'Black';
    }
    return players;
  }

  private result(): string | null {
    if (this.gameResult) return this.gameResult;
    return this.chess.isGameOver() ? this.chess.isCheckmate() ? (this.chess.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2' : null;
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put<StoredGame>('game', { fen: this.chess.fen(), pgn: this.chess.pgn(), result: this.result() });
  }

  private async restore(): Promise<void> {
    const stored = await this.ctx.storage.get<StoredGame>('game');
    if (!stored) return;
    this.gameResult = stored.result;
    try { this.chess.loadPgn(stored.pgn); }
    catch { this.chess = new Chess(stored.fen); }
  }

  private send(socket: WebSocket, data: unknown): void {
    try { socket.send(JSON.stringify(data)); } catch { /* connection closed */ }
  }

  private broadcast(data: unknown): void {
    for (const socket of this.ctx.getWebSockets()) this.send(socket, data);
  }
}
