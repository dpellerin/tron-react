# App Plan

## Working Title
- Tron

## One-Liner
- A modern browser version of my original VIC-BASIC Tron-like light-cycle game where players leave walls and try to make the opponent crash.

## Goals
- Recreate the classic Tron light-cycle feel from the original game.
- Keep gameplay fast, simple, and competitive.
- Make it easy to play locally in a browser.

## Non-Goals
- Massive multiplayer or online matchmaking (for now).
- Complex progression systems or monetization.

## Target Users
- Retro game fans and people who enjoy fast arcade duels against the computer.

## Core User Stories
- As a player, I can start a match and control a light cycle that leaves a wall.
- As a player, I can win by forcing the computer opponent to crash into a wall.
- As a player, I can restart quickly after a round ends.

## Features (MVP)
- Single-player match vs computer AI.
- Full-viewport arena with smooth, continuous movement and wall trails.
- Collision detection (walls and bounds).
- Round end + winner display.
- Simple start/restart flow.
- Score display for each player.
- Rounds gradually speed up over time.
 - Computer player logic (aggressive pathing/cutoff behavior).

## Future Ideas
- Two-player local match (same keyboard).
- Adjustable speed and arena size.
- Scorekeeping (best of N).
- Visual themes (retro CRT, neon).
- Xbox controller support.

## Tech Stack
- Vite + React + TypeScript
- Canvas rendering for smooth movement and trails

## Data & APIs
- No external APIs needed for MVP.

## UX / UI Direction
- Neon / retro arcade vibe; primary-color glow against black or deep blue.
- Score at top left and top right, classic arcade style.
- Players start on left and right edges and move toward center on game start.

## Settings
- User-selectable: number of rounds to win.
- User-selectable: AI difficulty (Easy / Normal / Hard).
- Defaults (not user-facing): speed ramp, trail thickness, collision tolerance.

## Game Rules
- Two players start on opposite sides and move toward center on round start.
- Players move continuously; no 180-degree turns (left/right only).
- A round ends when a player hits any wall (arena bounds or trail).
- If both collide on the same frame, the round is a tie.
- Winner gets 1 point; first to N wins the match (user selectable).
- Restart: space to start round, R to reset match (TBD).

## Milestones
- Milestone 1: Basic arena, player movement, wall trails.
- Milestone 2: Collision + win state + restart flow.
- Milestone 3: Polish visuals + input tuning.

## Open Questions
- Keyboard controls: one player uses arrows, the other uses WASD.
- Controller support: optional Xbox controller (nice-to-have).
- Arena size: full browser viewport (responsive).
- Movement model: smooth continuous motion with trail thickness for collisions.
- Default speed: 240 px/sec, +20 px/sec every 5 seconds, cap at 520 px/sec.
- Trail thickness: 6 px; collision radius 3 px around the trail centerline.
- Collision tolerance: 1 px (for numeric stability).
