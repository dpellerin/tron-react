# Task List

- [x] Scaffold Vite + React + TypeScript app
- [x] Add canvas game loop (requestAnimationFrame) with fullscreen arena
- [x] Implement player movement rules (no 180-degree turns) and trail rendering
- [x] Add collision detection for trails and arena bounds
- [x] Build computer AI (aggressive cutoff) with difficulty levels
- [x] Add UI overlay: score display, round start, win/lose, settings for rounds + difficulty
- [x] Hook up input: keyboard controls, start/reset keys, pause (optional)
- [ ] Add lightcycle SVG asset support and render sprites
- [x] Polish visuals: neon glow, background, simple VFX
- [x] Add basic QA checklist (controls, collisions, speed ramp)

## QA Checklist
- Controls: WASD and arrow keys steer; no 180-degree turns.
- Start/Reset: Space starts round; R resets match; overlay text updates correctly.
- Collisions: Trails + bounds trigger round end; head-to-head is a tie.
- AI: Chooses safe path when available; difficulty affects behavior.
- Speed: Movement starts slow and ramps over time without stutter.
