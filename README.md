# On the Line

*Draw one line. Never cross it. Get hung.*

A daily browser game in which every run is a painting. Everyone draws on the same sheet of paper each day. The best painting is hung as **The Masterpiece**, and the leaderboard is a salon wall of real paintings. Strategy, research and roadmap are in [`docs/STRATEGY.md`](docs/STRATEGY.md).

## Play locally

```sh
npm start              # http://localhost:8080  (Node ≥ 22.13, no dependencies)
npm test
DB_FILE=data/dev.db node --no-warnings scripts/seed-demo.js   # fill the wall with bot artists
```

- **Steer:** `←` `→` or `A` `D`, or hold the left or right half of the screen.
- **Restart:** `Space`.

## How it fits together

| Path | What |
|---|---|
| `public/js/sim.js` | Deterministic simulation shared by browser and server. Only basic arithmetic, a hand-built trig table, and seeded RNG. |
| `public/js/render.js` | Risograph renderer: paper, halftone stones, ink layer, grain, blot, SVG export. |
| `public/js/main.js` | The app: foyer, play loop, results, the Wall, the Collection, the replay viewer. |
| `public/js/{palette,titles,share,audio,net,calendar}.js` | Daily ink editions, generated titles, share card and poster, WebAudio, API client, dates and names. |
| `server/server.js` | Static files plus the JSON API. Every submitted run is **replayed** before it is accepted. |
| `server/db.js` | `node:sqlite` storage. |

### API

| Endpoint | Purpose |
|---|---|
| `GET /api/today` | Date, exhibition number and seed. |
| `POST /api/player` | `{name}` returns `{id, secret}`; `{id, secret, name}` renames. |
| `POST /api/start` | Signed start ticket. |
| `POST /api/run` | `{id, secret, date, version, inputs, score, ticket}` returns rank, tier and rival. |
| `GET /api/board?date&pid` | Top 30, ranks around you, totals, most-prolific crown. |
| `GET /api/run/:id` | A painting's inputs, so anyone can re-render it. |
| `GET /api/collection` | Past Masterpieces. |
| `POST /api/me` | Dethrone notices and history. |

### Deploy

Any host that runs a Node 22 container with a persistent disk will work. Set:

- `DB_FILE` to a path on the persistent volume;
- `TICKET_SECRET` to a long random string;
- `PORT`.

A `Dockerfile` is included.

Changing anything in `sim.js` that alters outcomes requires bumping `VERSION`. Old clients are then asked to reload.
