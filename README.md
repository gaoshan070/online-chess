# Open Chess

A small, shareable two player chess game built with React, TypeScript, chess.js, Cloudflare Workers, and Durable Objects. The Worker validates every move; a Durable Object owns each room's WebSocket connections and persists the game position.

## Run locally

Requirements: a supported Node.js LTS release (22 or later) and npm.

```sh
npm install
npm run build
npx wrangler dev --port 8787
```

Open `http://localhost:8787` to use the built app and local Durable Object. For frontend hot reload, keep Wrangler running and start `npm run dev` in another terminal; open `http://localhost:5173`.

## Deploy to Cloudflare

```sh
npm install
npm run deploy
```

Wrangler creates the `open-chess` Worker and its SQLite-backed Durable Object class on the first deploy. Use `npx wrangler deploy` after later changes. Attach a custom domain in the Cloudflare dashboard if desired.

## Current game flow

- Create a room and share its link, or join using its room code.
- The first two connected players take White and Black; additional connections can watch.
- The server checks turn order and legal moves. Pawn promotion currently defaults to a queen.
- Positions and game results survive Durable Object hibernation. Refreshing creates a new player connection; rooms currently have no accounts or durable player identity.

## Next useful additions

Player reconnection identity, chess clocks, promotion selection, draw offers, PGN export, room expiry, rate limits, and automated game rules coverage.

