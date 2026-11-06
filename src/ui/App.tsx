import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';

type Color = 'w' | 'b' | null;
type ServerMessage = { type: string; color?: Color; fen?: string; pgn?: string; result?: string | null; message?: string; players?: { white: string | null; black: string | null } };
const symbols: Record<string, string> = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' };
const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export default function App() {
  const [room, setRoom] = useState(new URLSearchParams(location.search).get('room')?.toUpperCase() || '');
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>(null);
  const [fen, setFen] = useState(new Chess().fen());
  const [result, setResult] = useState<string | null>(null);
  const [players, setPlayers] = useState({ white: null as string | null, black: null as string | null });
  const [status, setStatus] = useState('Create a room or enter a room code to play.');
  const [selected, setSelected] = useState<Square | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const game = useMemo(() => { const chess = new Chess(); try { chess.load(fen); } catch { /* keep start position */ } return chess; }, [fen]);

  useEffect(() => {
    if (!room) return;
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${scheme}//${location.host}/ws?room=${encodeURIComponent(room)}`);
    setSocket(ws);
    ws.onopen = () => { setConnected(true); setStatus('Connected. Joining room…'); ws.send(JSON.stringify({ type: 'join', name })); };
    ws.onmessage = event => {
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.type === 'joined') setColor(msg.color ?? null);
      if (msg.type === 'state' || msg.type === 'joined') {
        if (msg.fen) setFen(msg.fen);
        setResult(msg.result ?? null);
        if (msg.players) setPlayers(msg.players);
      }
      if (msg.type === 'error') setStatus(msg.message || 'Something went wrong.');
      if (msg.type === 'state') setStatus(msg.result ? `Game finished · ${msg.result}` : 'Game is live.');
      if (msg.type === 'joined' && msg.color) setStatus(msg.color === 'w' ? 'You are White. Make the first move.' : 'You are Black. White moves first.');
      if (msg.type === 'joined' && !msg.color) setStatus('Room is full. You are watching as a guest.');
    };
    ws.onclose = () => { setConnected(false); setStatus('Disconnected. Refresh to reconnect.'); };
    ws.onerror = () => setStatus('Could not connect to the game server.');
    return () => { ws.close(); setSocket(null); };
  }, [room]);

  const startRoom = (code = roomCode()) => {
    setColor(null); setFen(new Chess().fen()); setResult(null); setPlayers({ white: null, black: null }); setSelected(null);
    history.replaceState(null, '', `?room=${code}`); setRoom(code);
  };
  const playMove = (from: Square, to: Square) => {
    if (!socket || socket.readyState !== WebSocket.OPEN || !color || color !== game.turn() || result) return;
    const move = game.moves({ square: from, verbose: true }).find(candidate => candidate.to === to);
    if (!move) return;
    socket.send(JSON.stringify({ type: 'move', from, to, ...(move.promotion ? { promotion: 'q' } : {}) }));
    setSelected(null);
  };
  const onSquare = (square: Square) => {
    if (!color || color !== game.turn() || result) return;
    if (selected) {
      const possible = game.moves({ square: selected, verbose: true }).some(move => move.to === square);
      if (possible) { playMove(selected, square); return; }
    }
    const piece = game.get(square);
    setSelected(piece?.color === color ? square : null);
  };
  const copyLink = async () => { await navigator.clipboard.writeText(`${location.origin}/?room=${room}`); setStatus('Game link copied. Send it to your friend.'); };
  const rows = Array.from({ length: 8 }, (_, index) => index);
  const cols = Array.from({ length: 8 }, (_, index) => index);
  const orientedRows = color === 'b' ? [...rows].reverse() : rows;
  const orientedCols = color === 'b' ? [...cols].reverse() : cols;
  const legalTargets = selected ? new Set(game.moves({ square: selected, verbose: true }).map(move => move.to)) : new Set<string>();
  const board = game.board();

  return <main className="page-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">♞</span> open chess</a><span className={`connection ${connected ? 'online' : ''}`}><i />{connected ? 'LIVE' : 'READY'}</span></header>
    <section className="intro"><p className="eyebrow">A little room for a good game</p><h1>Chess, with a friend.</h1><p className="subhead">Create a private room, share the link, and play.</p></section>
    <div className="layout">
      <section className="board-panel">
        <div className="player-row"><div className="avatar dark">♚</div><div><strong>{players.black || 'Black'}</strong><span>{color === 'b' ? 'You' : 'Opponent'}</span></div><span className={`turn-dot ${game.turn() === 'b' && !result ? 'active' : ''}`} /></div>
        <div className="board" role="grid" aria-label="Chessboard">
          {orientedRows.flatMap(row => orientedCols.map(col => {
            const square = `${'abcdefgh'[col]}${8 - row}` as Square;
            const piece = board[row][col];
            const light = (row + col) % 2 === 0;
            const isTarget = legalTargets.has(square);
            return <button key={square} role="gridcell" aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`} onClick={() => onSquare(square)} className={`square ${light ? 'light' : 'dark'} ${selected === square ? 'selected' : ''} ${isTarget ? 'target' : ''}`}>
              {col === orientedCols[0] && <small className="rank-label">{8 - row}</small>}{row === orientedRows[7] && <small className="file-label">{'abcdefgh'[col]}</small>}
              {piece && <span className={`piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`}>{symbols[piece.color + piece.type]}</span>}
            </button>;
          }))}
        </div>
        <div className="player-row bottom"><div className="avatar light-avatar">♔</div><div><strong>{players.white || 'White'}</strong><span>{color === 'w' ? 'You' : 'Opponent'}</span></div><span className={`turn-dot ${game.turn() === 'w' && !result ? 'active' : ''}`} /></div>
      </section>
      <aside className="side-panel">
        <div className="card room-card"><div className="card-heading"><div><p className="eyebrow">YOUR GAME</p><h2>{room ? `Room ${room}` : 'Start a game'}</h2></div><span className="live-pill"><i />{connected ? 'LIVE' : 'READY'}</span></div>
          {!room ? <><label htmlFor="player-name">Your name</label><input id="player-name" value={name} onChange={event => setName(event.target.value)} maxLength={20} placeholder="Player"/><button className="primary-button" onClick={() => startRoom()}>Create a room <span>↗</span></button><div className="divider"><span>or join a friend</span></div><form className="join-form" onSubmit={event => { event.preventDefault(); if (joinCode.trim()) startRoom(joinCode.trim().toUpperCase()); }}><input aria-label="Room code" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().slice(0, 8))} placeholder="Enter room code" maxLength={8}/><button className="secondary-button">Join</button></form></> : <><p className="status-text">{status}</p><button className="primary-button" onClick={copyLink} disabled={!connected}>Copy invite link <span>↗</span></button><button className="secondary-button full" onClick={() => startRoom()}>New game</button></>}
        </div>
        <div className="card moves-card"><div className="card-heading"><div><p className="eyebrow">THE GAME</p><h2>Move history</h2></div><span className="move-count">{game.history().length} plies</span></div>
          <div className="move-list">{game.history().length === 0 ? <p className="empty-moves">Moves will show up here once the game begins.</p> : <div className="move-grid">{game.history().map((move, i) => i % 2 === 0 ? <span key={i} className="move-pair"><b>{Math.floor(i / 2) + 1}.</b> {move} <em>{game.history()[i + 1] || ''}</em></span> : null)}</div>}</div>
          {result && <div className="result-banner">{game.isCheckmate() ? 'Checkmate' : 'Game drawn'} <strong>{result}</strong></div>}
          {color && !result && <button className="resign-button" onClick={() => socket?.send(JSON.stringify({ type: 'resign' }))}>Resign game</button>}
        </div>
        <p className="footnote">No account needed · Just you and your opponent</p>
      </aside>
    </div>
    <footer><span>OPEN CHESS</span><span>Made for the love of the game</span></footer>
  </main>;
}
