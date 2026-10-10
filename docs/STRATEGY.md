# ON THE LINE — strategy

*Draw one line. Never cross it. Get hung.*

Written by the founding team (CEO / CTO / CFO / CMO hats, one head), October 2026.
It is based on three research tracks run before any design was fixed:
1. the psychology of replayable games;
2. leaderboard design and viral web projects;
3. art direction and monetisation.

The findings and their sources are summarised in §7.

---

## 1. The product in one paragraph

Every day the world gets the same sheet of paper. You steer a pen that never stops moving, holding left or holding right, and you must never cross your own line. Pigment dots raise your multiplier, and flying close to your own line ("grazing") scores extra. The page fills up and the pen speeds up, so every run ends, usually within 30 seconds to 3 minutes, in an ink blot.

**Every run is a painting.** The day's leaderboard is an exhibition, with tiers named after real art history:

- **The Masterpiece (#1)** is hung alone on the homepage for everyone to see.
- **On the Line (#2–10)** is eye level, the coveted spot at the Royal Academy.
- **Skyed (#11–100)** is hung up near the ceiling.
- **Salon des Refusés** covers everyone else.

At midnight UTC the Masterpiece enters the **Permanent Collection**, forever.

The name is the pitch: you play *on the line*, and you are fighting to stay *on the line*.

## 2. Why this will work: the psychology, mechanism by mechanism

| Mechanism (research) | How it shows up in the game |
|---|---|
| **Bushnell's law**: easy to learn, hard to master | Two inputs. No tutorial beyond one sentence. The ceiling is visible: on the Wall you can see that experts fill the page densely, and how. |
| **Flow**: the run ramps from trivial to impossible | The pen starts slow and accelerates. The page gets more crowded. Pigment spawns in the open space, which gets riskier as the page fills. |
| **Fast restart** (Flappy Bird's slow game-over screen was a documented irritant) | Death to new run in under 350 ms with the same key or tap. No ad and no modal between death and retry, ever. |
| **Near-miss with real control** (Clark 2009) | "312 more to pass MARGOT (#6)". Your best line is drawn in pencil as an *underdrawing* you race against. Grazing is rewarded, so near-misses are the skill. We never fake one. |
| **Variable reward from skill, not purchase** | Pigment placement is seeded but unpredictable. Chasing it is a live risk/reward call, and greedy runs score more. |
| **Scarcity + daily ritual** (Wordle, Spelunky Daily) | One shared paper per day, numbered ("No. 14"), with unlimited attempts and a visible countdown to close. The Studio offers unlimited random practice. |
| **N-effect / big fish, little pond** (Garcia & Tor 2009) | Nobody sees "#48,211 of 50,000". You see your tier, your nearest rival, and a percentile ("better than 73% of today's artists"). Tiers turn a rank into a place on the wall. |
| **A stealable, named crown** (Strava's lost-KOM email, arcade initials) | The Masterpiece hangs on the homepage under the holder's name. When it is taken, the old holder sees "Your painting was moved… BEA now holds the Masterpiece." The lineage is permanent (the Collection). |
| **A crown devotion can win** (Strava Local Legends) | "Most prolific" goes to whoever puts the most metres of ink on paper today. Skill wins the Masterpiece, and anyone can win this one. |
| **IKEA effect**: things you made, and finished, are valued | You *made* a painting. It has your signature, a title, and a place on a wall. It can be downloaded as a vector print file. |
| **Identity + labels** (The Button's flair) | Tiers are an identity: "I got hung on the line today", "Refusés again". |
| **Forgiving streaks** (Duolingo's data: softening streaks improves retention) | "Exhibitions in a row" forgives one missed day per week. There are no guilt notifications. |
| **Zeigarnik open loop** | The exhibition closes at midnight, the Masterpiece is held "so far", and your rival is 312 points ahead. |

## 3. Why people will talk about it (STEPPS)

- **Social currency.** Each run gets a generated, deadpan art-world title:
  - "Study, Crossing Itself"
  - "Nocturne for Two Thumbs"
  - "Sneeze" (anything under 4 seconds)

  Funny titles get quoted and screenshotted.
- **Triggers.** A numbered daily exhibition, closing at a fixed time.
- **Emotion.** High arousal at both ends: the crash into your own line, and the dethroning.
- **Public.** The share strip is spoiler-free and Wordle-like:
  ```
  ON THE LINE · No. 14
  “Nocturne, Leaving the Frame”
  4,812 — hung on the line (#7 of 2,104)
  〰️〰️🟪〰️🟨🟨〰️✖️
  ```
  It comes with a 4:5 poster of the painting itself. Every share is a piece of art, not a score screenshot.
- **Stories.** "Margot has held the Masterpiece for three days." "Someone spelled a word in one line." "The Refusés are organising."
- **Art-history hook for press.** "On the line", skying and the Salon des Refusés are real history. Design, art and culture press can write about a game that does this.

## 4. The visual identity (and why it is not off the shelf)

In 2026 the award-winning web defaults to glossy 3D WebGL. We went the other way: **a living risograph**.

- **The painting:**
  - Real Riso drum inks (Federal Blue, Fluorescent Pink, Sunflower, Aqua…).
  - A new three-ink *edition* every day, so you can tell which day a painting is from by its colours.
  - Newsprint paper with fibres.
  - Halftone stones printed slightly out of register.
  - Drum-dropout grain.
  - An ink blot where every run ends.
- **The room:** an oxblood salon wall, a brass picture light, a black frame with a white mat, and a museum label (Instrument Serif italic titles, Space Mono numbers, Bricolage Grotesque labels). A giant "ON THE LINE" is painted faintly on the wall.
- **Buttons:** fluorescent pink with a misregistered blue plate behind them. The print error is the brand mark.
- **The leaderboard:** a salon hang of real paintings rendered from replays. It is not a table.

The identity is cheap to render, readable at thumbnail size, and prints on paper as itself.

## 5. Business model (CFO)

Order of operations, gated on daily active users (DAU):

| Stage | Revenue lever | Notes |
|---|---|---|
| Launch | None. Grow first. | Wordle had no ads, no account and no link in the share. Frictionless wins. |
| ~5k DAU | **Prints of your own painting.** Riso and Giclée posters at $35–45, framed at $75–95, made from the exact run. Run via Printful/Fourthwall API with our vector export. | No game we found sells "your run as a poster". The closest analogue is race-route posters ($37–217). Unit cost is about $12–25. Each painting is unique, which is high-margin and on-brand. |
| ~5k DAU | **Monthly Masterpiece riso edition**: a small run (50–100) of each month's best painting, signed with the artist's name. | Status merch. The winner gets a copy, which builds lore. |
| ~20k DAU | **Rewarded and break ads** via AdSense H5 Games. Only on the way back to the foyer, never between death and retry, capped at one per 4 minutes. A $3.99 one-time "remove ads". | Web net eCPM is about $1.50 blended, so roughly $700/month at 10k DAU. Ads are a minority of revenue below 100k DAU. A stub is already wired and switched off. |
| ~20k DAU | **Patron tier** (about $3/month): extra Studio paper editions, the full archive of past exhibitions, a patron seal on your label, one free print file a month. | Never sell score advantage. |
| ~20k DAU | **"Presented by" exhibitions.** A brand or museum sponsors a day: their palette, a credit on the label and share card. | Galleries, art schools, paint and print brands, and festivals are the natural sponsors. |
| Later | Tees and totes of famous Masterpieces, printed in one or two colours. Licensing the daily to media sites. | |

Costs: one small VM with a disk at about $5–10/month handles the early stage. Every run is replayed server-side in about a millisecond.

## 6. Go-to-market (CMO)

1. **Seed the wall before launch.** Run a closed alpha with 30–50 artists, designers and game people, so No. 1 opens with real paintings and real rivalries.
2. **Launch on a day with a story:** "The first Masterpiece goes into the Permanent Collection tonight."
3. **Channels:**
   - Show HN and r/WebGames: technical angle (deterministic replays, no dependencies).
   - Design Twitter/Bluesky, Are.na, Instagram: the posters.
   - TikTok / Shorts: 15-second clips of a run being drawn at 4×, ending in a blot. The Wall's replay viewer is already the clip tool.
   - Art press: the salon story.
4. **Streamers.** The game reads at a glance, and a single run fits in a clip. Next feature: a challenge code so chat races the streamer on the same paper.
5. **Rituals we own:**
   - "Hanging Day" every midnight UTC, with a post of yesterday's Masterpiece.
   - A weekly "Salon des Refusés" showcase of the funniest bad paintings.

## 7. Research notes (condensed)

- **Leaderboards act like hard goals** and raise effort, mostly for experienced players (Landers 2017).
  - More competitors means less motivation (Garcia & Tor 2009).
  - Duolingo's small leagues raised learning time 17% and tripled highly engaged learners.
  - Friend boards and nearby ranks beat global boards for retention (Meta Instant Games guidance).
  - Dethroning alerts drive "reclaim" behaviour (Strava KOM).
- **Anti-cheat:** never trust a posted score. The industry standard (Trackmania, AntGame) is a deterministic simulation with server-side input-log replay, plus timing checks and public replays.
- **Viral web patterns:** one-sentence absurd premise, daily seed, spoiler-free share artifact, a crown or shared state, finite events, hidden depth. Examples: Wordle, The Button, r/place, One Million Checkboxes, Infinite Craft.
- **Session targets:**
  - Run: 30 s – 3 min.
  - Session: 5–15 min.
  - Daily ritual: 2–5 min.
  - D1 retention ≥ 40%, D7 ≥ 20% (Voodoo's prototype bar is D1 50%, D7 22%).
- **Ethics:** no fake near-misses, no loot boxes, no pay-to-win, no ads before retry, no guilt notifications. Streaks are forgiving.
- **Monetisation benchmarks:**
  - GeoGuessr: about €21M/year, 85–90% from subscriptions.
  - Slither.io: about $100k/day at its peak from ads plus a $3.99 remove-ads purchase.
  - Wordle: sold to the NYT for low seven figures, used as a subscription funnel.

## 8. What is built (v0.1)

- The deterministic game. The same code runs in the browser and on the server, using its own trig table so results are identical across engines.
- The daily exhibition and the Studio (practice).
- The verified leaderboard:
  - every run is replayed server-side;
  - signed start tickets stop instantly fabricated runs;
  - per-IP rate limits;
  - a plausibility check on input rate.
- Tiers, rival gap, percentile, dethroning notices, the most-prolific crown, and the Permanent Collection.
- The Wall as a salon hang of real paintings, and a replay viewer ("watch it drawn").
- Generated titles, the share strip, the poster PNG, and the vector print file (SVG).
- Generative audio: pen scratch, graze tone, pentatonic pigment notes, result chords.
- Offline play, mobile touch controls, keyboard controls, and the pencil underdrawing of your best line.

## 9. Next (in order)

1. Deploy, then run the closed alpha (see the decisions below).
2. Analytics: privacy-friendly events for run start, death, share, and D1/D7 cohorts.
3. Challenge codes and links: "draw on my paper".
4. Optional accounts (passkey or email), so names can't be squatted and the Masterpiece holder is verified.
5. A dethrone notification channel: email or web push, opt-in.
6. The print shop (Printful API) and the monthly riso edition.
7. Moderation tools: report a name, hide a painting.
8. Weekly leagues of about 30 players with promotion and demotion, once there is enough volume.
