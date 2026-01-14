import type { GridState } from './types'

export type Difficulty = 'easy' | 'normal' | 'hard'
export type RoundResult = 'player' | 'ai' | 'tie'
export type Direction = 'up' | 'down' | 'left' | 'right'

type Vec = {
  x: number
  y: number
}

type Segment = {
  a: Vec
  b: Vec
}

type Particle = {
  pos: Vec
  vel: Vec
  life: number
  ttl: number
  size: number
}

type Explosion = {
  origin: Vec
  color: string
  particles: Particle[]
  life: number
  ttl: number
  rings: Ring[]
}

type Ring = {
  radius: number
  width: number
  speed: number
}

type PlayerState = {
  id: 'player' | 'ai'
  pos: Vec
  dir: Vec
  color: string
  segments: Segment[]
}

type EngineCallbacks = {
  onRoundEnd: (result: RoundResult) => void
  onTurn?: (who: 'player' | 'ai') => void
}

const BASE_SPEED = 240
const SPEED_STEP = 20
const SPEED_INTERVAL = 5
const MAX_SPEED = 520
const TRAIL_WIDTH = 6
const COLLISION_RADIUS = 5
const COLLISION_TOLERANCE = 1
const SPAWN_PADDING = 80
const GRID_STEP = 48
const VORONOI_STEP = (TRAIL_WIDTH + COLLISION_RADIUS + COLLISION_TOLERANCE) * 2
const CRASH_FLASH_DURATION = 0.6
const WALL_SHRINK_DURATION = 0.9

const COLORS = {
  player: '#2dd4ff',
  ai: '#ffb347',
}

type DifficultyConfig = {
  decisionInterval: number
  sampleStep: number
  lookahead: number
  aggression: number
  caution: number
  randomness: number
  interceptHorizon: number
  simHorizon: number
  minTurnBenefit: number
  minShortClear: number
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    decisionInterval: 0.20,
    sampleStep: 12,
    lookahead: 450,
    aggression: 0.2,
    caution: 1.3,
    randomness: 0.02,
    interceptHorizon: 0.3,
    simHorizon: 300,
    minTurnBenefit: 0.02,
    minShortClear: 6,
  },
  normal: {
    decisionInterval: 0.10,
    sampleStep: 8,
    lookahead: 900,
    aggression: 0.8,
    caution: 1.5,
    randomness: 0.0,
    interceptHorizon: 0.7,
    simHorizon: 600,
    minTurnBenefit: 0.08,
    minShortClear: 8,
  },
  hard: {
    decisionInterval: 0.05,
    sampleStep: 6,
    lookahead: 1400,
    aggression: 1.2,
    caution: 1.6,
    randomness: 0.0,
    interceptHorizon: 1.0,
    simHorizon: 900,
    minTurnBenefit: 0.05,
    minShortClear: 10,
  },
}

const DIRECTION_VECTORS: Record<Direction, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export class TronEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private callbacks: EngineCallbacks

  private width = 0
  private height = 0
  private dpr = 1

  private player: PlayerState
  private ai: PlayerState
  private playerImage: HTMLImageElement | null = null
  private aiImage: HTMLImageElement | null = null

  private running = false
  private rafId: number | null = null
  private lastTime = 0
  private speed = BASE_SPEED
  private speedTimer = 0
  private aiDecisionTimer = 0
  private paused = false
  private explosions: Explosion[] = []
  private aiDistanceSinceTurn = 0
  private crashTimers: Record<'player' | 'ai', number> = { player: 0, ai: 0 }
  private crashed: Record<'player' | 'ai', boolean> = { player: false, ai: false }
  private wallShrink: Record<'player' | 'ai', { delay: number; progress: number; active: boolean }> = {
    player: { delay: 0, progress: 0, active: false },
    ai: { delay: 0, progress: 0, active: false },
  }

  private difficulty: Difficulty = 'normal'

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas rendering context not available')
    }
    this.ctx = ctx
    this.callbacks = callbacks

    this.player = this.createPlayer('player')
    this.ai = this.createPlayer('ai')

    this.resize()
    this.loadAssets()
    this.resetRoundState()
    this.startLoop()
  }

  private loadAssets() {
    const playerImg = new Image()
    playerImg.src = new URL('../assets/player_sprite.png', import.meta.url).toString()
    playerImg.onload = () => {
      this.playerImage = playerImg
    }

    const aiImg = new Image()
    aiImg.src = new URL('../assets/ai_sprite.png', import.meta.url).toString()
    aiImg.onload = () => {
      this.aiImage = aiImg
    }
  }

  startRound() {
    this.resetRoundState()
    this.running = true
    this.paused = false
  }

  reset() {
    this.running = false
    this.paused = false
    this.resetRoundState()
  }

  pause() {
    if (this.running) {
      this.paused = true
    }
  }

  resume() {
    if (this.running) {
      this.paused = false
    }
  }

  setDifficulty(level: Difficulty) {
    this.difficulty = level
  }

  setPlayerDirection(direction: Direction) {
    if (!this.running) {
      return
    }

    const nextDir = { ...DIRECTION_VECTORS[direction] }
    if (isOpposite(this.player.dir, nextDir)) {
      return
    }
    if (isSameDirection(this.player.dir, nextDir)) {
      return
    }

    this.applyDirection(this.player, nextDir)
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = window.devicePixelRatio || 1
    this.width = rect.width
    this.height = rect.height

    this.canvas.width = Math.floor(this.width * this.dpr)
    this.canvas.height = Math.floor(this.height * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
    }
  }

  private resetRoundState() {
    this.speed = BASE_SPEED
    this.speedTimer = 0
    this.aiDecisionTimer = 0
    this.running = false
    this.paused = false
    this.crashed.player = false
    this.crashed.ai = false
    this.crashTimers.player = 0
    this.crashTimers.ai = 0
    this.wallShrink.player = { delay: 0, progress: 0, active: false }
    this.wallShrink.ai = { delay: 0, progress: 0, active: false }

    const centerY = this.height * 0.5

    this.player = {
      id: 'player',
      pos: { x: SPAWN_PADDING, y: centerY },
      dir: { ...DIRECTION_VECTORS.right },
      color: COLORS.player,
      segments: [{
        a: { x: SPAWN_PADDING, y: centerY },
        b: { x: SPAWN_PADDING, y: centerY },
      }],
    }

    this.ai = {
      id: 'ai',
      pos: { x: this.width - SPAWN_PADDING, y: centerY },
      dir: { ...DIRECTION_VECTORS.left },
      color: COLORS.ai,
      segments: [{
        a: { x: this.width - SPAWN_PADDING, y: centerY },
        b: { x: this.width - SPAWN_PADDING, y: centerY },
      }],
    }
  }

  private createPlayer(id: PlayerState['id']): PlayerState {
    return {
      id,
      pos: { x: 0, y: 0 },
      dir: { x: 1, y: 0 },
      color: id === 'player' ? COLORS.player : COLORS.ai,
      segments: [],
    }
  }

  private startLoop() {
    this.lastTime = performance.now()
    const loop = (time: number) => {
      const delta = Math.min((time - this.lastTime) / 1000, 0.05)
      this.lastTime = time
      this.update(delta)
      this.render()
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private update(delta: number) {
    if (this.explosions.length > 0) {
      this.updateExplosions(delta)
    }
    this.crashTimers.player = Math.max(0, this.crashTimers.player - delta)
    this.crashTimers.ai = Math.max(0, this.crashTimers.ai - delta)
    this.updateWallShrink(delta)
    if (!this.running || this.paused) {
      return
    }

    this.speedTimer += delta
    if (this.speedTimer >= SPEED_INTERVAL) {
      const steps = Math.floor(this.speedTimer / SPEED_INTERVAL)
      this.speed = Math.min(MAX_SPEED, this.speed + steps * SPEED_STEP)
      this.speedTimer -= steps * SPEED_INTERVAL
    }

    this.updateAI(delta)

    const moveDistance = this.speed * delta
    this.aiDistanceSinceTurn += moveDistance
    const nextPlayerPos = {
      x: this.player.pos.x + this.player.dir.x * moveDistance,
      y: this.player.pos.y + this.player.dir.y * moveDistance,
    }
    const nextAiPos = {
      x: this.ai.pos.x + this.ai.dir.x * moveDistance,
      y: this.ai.pos.y + this.ai.dir.y * moveDistance,
    }

    this.extendSegment(this.player, nextPlayerPos)
    this.extendSegment(this.ai, nextAiPos)

    const playerHit = this.checkCollision(nextPlayerPos, this.player, this.ai)
    const aiHit = this.checkCollision(nextAiPos, this.ai, this.player)
    const headHit = distance(nextPlayerPos, nextAiPos) <= COLLISION_RADIUS * 2

    if (headHit || (playerHit && aiHit)) {
      this.spawnExplosion(nextPlayerPos, this.player.color)
      this.spawnExplosion(nextAiPos, this.ai.color)
      this.crashTimers.player = CRASH_FLASH_DURATION
      this.crashTimers.ai = CRASH_FLASH_DURATION
      this.crashed.player = true
      this.crashed.ai = true
      this.endRound('tie')
    } else if (playerHit) {
      this.spawnExplosion(nextPlayerPos, this.player.color)
      this.crashTimers.player = CRASH_FLASH_DURATION
      this.crashed.player = true
      this.startWallShrink('player')
      this.endRound('ai')
    } else if (aiHit) {
      this.spawnExplosion(nextAiPos, this.ai.color)
      this.crashTimers.ai = CRASH_FLASH_DURATION
      this.crashed.ai = true
      this.startWallShrink('ai')
      this.endRound('player')
    }
  }

  private updateAI(delta: number) {
    this.aiDecisionTimer -= delta
    if (this.aiDecisionTimer > 0) {
      return
    }

    const config = DIFFICULTY_CONFIG[this.difficulty]
    this.aiDecisionTimer = config.decisionInterval

    const chosen = this.decideAiDirection(config)
    if (chosen && !isSameDirection(this.ai.dir, chosen)) {
      this.applyDirection(this.ai, { ...chosen })
    }
  }

  private checkCollision(
    point: Vec,
    self: PlayerState,
    other: PlayerState,
    inflate: number = 0,
  ) {
    const radius = COLLISION_RADIUS + COLLISION_TOLERANCE + inflate

    if (
      point.x <= radius ||
      point.x >= this.width - radius ||
      point.y <= radius ||
      point.y >= this.height - radius
    ) {
      return true
    }

    if (this.pointHitsSegments(point, other.segments, radius)) {
      return true
    }

    if (self.segments.length > 2) {
      const selfSegments = self.segments.slice(0, -2) // ignore current growing + most recent completed turn
      if (this.pointHitsSegments(point, selfSegments, radius)) {
        return true
      }
    }

    return false
  }

  private pointHitsSegments(point: Vec, segments: Segment[], radius: number) {
    for (const segment of segments) {
      const distanceToSegment = distancePointToSegment(point, segment.a, segment.b)
      if (distanceToSegment <= radius) {
        return true
      }
    }
    return false
  }

  private applyDirection(player: PlayerState, dir: Vec) {
    player.dir = dir
    player.segments.push({
      a: { ...player.pos },
      b: { ...player.pos },
    })
    if (player.id === 'ai') {
      this.aiDistanceSinceTurn = 0
    }
    this.callbacks.onTurn?.(player.id)
  }

  private extendSegment(player: PlayerState, nextPos: Vec) {
    const currentSegment = player.segments[player.segments.length - 1]
    currentSegment.b = { ...nextPos }
    player.pos = { ...nextPos }
  }

  private endRound(result: RoundResult) {
    if (!this.running) {
      return
    }
    this.running = false
    this.callbacks.onRoundEnd(result)
  }

  private render() {
    this.drawBackground()
    this.drawTrails(this.player)
    this.drawTrails(this.ai)
    this.drawExplosions()
    this.drawCycle(this.player)
    this.drawCycle(this.ai)
  }

  private drawBackground() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    const gradient = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.45,
      0,
      this.width * 0.5,
      this.height * 0.45,
      Math.max(this.width, this.height) * 0.65,
    )
    gradient.addColorStop(0, '#081220')
    gradient.addColorStop(1, '#04060c')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, this.width, this.height)

    ctx.strokeStyle = 'rgba(45, 212, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()

    for (let x = 0; x <= this.width; x += GRID_STEP) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, this.height)
    }
    for (let y = 0; y <= this.height; y += GRID_STEP) {
      ctx.moveTo(0, y)
      ctx.lineTo(this.width, y)
    }
    ctx.stroke()
  }

  private drawTrails(player: PlayerState) {
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = player.color
    const trailScale = this.getTrailScale(player.id)
    if (trailScale <= 0) {
      ctx.restore()
      return
    }
    ctx.lineWidth = TRAIL_WIDTH * trailScale
    ctx.lineCap = 'round'
    ctx.shadowColor = player.color
    ctx.shadowBlur = 16

    ctx.beginPath()
    for (const segment of player.segments) {
      ctx.moveTo(segment.a.x, segment.a.y)
      ctx.lineTo(segment.b.x, segment.b.y)
    }
    ctx.stroke()
    ctx.restore()
  }

  private startWallShrink(id: 'player' | 'ai') {
    this.wallShrink[id] = {
      delay: CRASH_FLASH_DURATION,
      progress: 0,
      active: true,
    }
  }

  private updateWallShrink(delta: number) {
    const update = (id: 'player' | 'ai') => {
      const state = this.wallShrink[id]
      if (!state.active) return
      if (state.delay > 0) {
        state.delay = Math.max(0, state.delay - delta)
        return
      }
      state.progress = Math.min(1, state.progress + delta / WALL_SHRINK_DURATION)
      if (state.progress >= 1) {
        state.active = false
      }
    }
    update('player')
    update('ai')
  }

  private getTrailScale(id: 'player' | 'ai') {
    const state = this.wallShrink[id]
    if (!state.active && state.progress <= 0) {
      return 1
    }
    const base = Math.max(0, 1 - state.progress)
    if (state.progress > 0.5) {
      const t = (state.progress - 0.5) / 0.5
      const flashes = 12
      const flicker = Math.abs(Math.sin(t * Math.PI * flashes))
      return base * flicker
    }
    return base
  }

  private drawCycle(player: PlayerState) {
    const ctx = this.ctx
    const angle = vectorToAngle(player.dir)

    ctx.save()
    ctx.translate(player.pos.x, player.pos.y)
    ctx.rotate(angle + Math.PI / 2)
    ctx.shadowColor = player.color
    ctx.shadowBlur = 20

    const timer = player.id === 'player' ? this.crashTimers.player : this.crashTimers.ai
    if (this.crashed[player.id] && timer <= 0) {
      ctx.restore()
      return
    }
    const flashAlpha = this.crashed[player.id] ? Math.max(0, timer / CRASH_FLASH_DURATION) : 0

    if (player.id === 'player' && this.playerImage) {
      const img = this.playerImage
      const scale = 0.07
      const w = img.width * scale
      const h = img.height * scale
      const fadeAlpha = this.crashed[player.id] ? Math.max(0, flashAlpha) : 1
      ctx.globalAlpha = fadeAlpha
      ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h)
      if (flashAlpha > 0) {
        ctx.globalAlpha = flashAlpha
        ctx.globalCompositeOperation = 'screen'
        ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      } else {
        ctx.globalAlpha = 1
      }
    } else if (player.id === 'ai' && this.aiImage) {
      const img = this.aiImage
      const scale = 0.07
      const w = img.width * scale
      const h = img.height * scale
      const fadeAlpha = this.crashed[player.id] ? Math.max(0, flashAlpha) : 1
      ctx.globalAlpha = fadeAlpha
      ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h)
      if (flashAlpha > 0) {
        ctx.globalAlpha = flashAlpha
        ctx.globalCompositeOperation = 'screen'
        ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      } else {
        ctx.globalAlpha = 1
      }
    } else {
      ctx.fillStyle = player.color
      ctx.beginPath()
      ctx.moveTo(16, 0)
      ctx.lineTo(-12, -8)
      ctx.lineTo(-12, 8)
      ctx.closePath()
      ctx.fill()
      if (flashAlpha > 0) {
        ctx.globalAlpha = flashAlpha
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.moveTo(16, 0)
        ctx.lineTo(-12, -8)
        ctx.lineTo(-12, 8)
        ctx.closePath()
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()
  }

  private spawnExplosion(position: Vec, color: string) {
    const particleCount = 56
    const particles: Particle[] = []
    for (let i = 0; i < particleCount; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = 140 + Math.random() * 280
      particles.push({
        pos: { ...position },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life: 0,
        ttl: 0.9 + Math.random() * 0.4,
        size: 2.5 + Math.random() * 4.5,
      })
    }
    const rings: Ring[] = [
      { radius: 0, width: 6, speed: 260 },
      { radius: 0, width: 3, speed: 360 },
    ]
    this.explosions.push({
      origin: { ...position },
      color,
      particles,
      life: 0,
      ttl: 1.1,
      rings,
    })
  }

  private updateExplosions(delta: number) {
    for (const explosion of this.explosions) {
      explosion.life += delta
      for (const particle of explosion.particles) {
        particle.life += delta
        particle.pos.x += particle.vel.x * delta
        particle.pos.y += particle.vel.y * delta
        particle.vel.x *= 0.92
        particle.vel.y *= 0.92
      }
      for (const ring of explosion.rings) {
        ring.radius += ring.speed * delta
        ring.width = Math.max(1.5, ring.width - delta * 2)
      }
    }
    this.explosions = this.explosions.filter(
      (explosion) => explosion.life < explosion.ttl,
    )
  }

  private decideAiDirection(config: DifficultyConfig): Vec | null {
    const cellSize = VORONOI_STEP
    const gridW = Math.max(4, Math.floor(this.width / cellSize))
    const gridH = Math.max(4, Math.floor(this.height / cellSize))

    const occupied = this.buildOccupiedGrid(gridW, gridH, cellSize)
    const aiState = {
      x: Math.floor(this.ai.pos.x / cellSize),
      y: Math.floor(this.ai.pos.y / cellSize),
      dir: this.vectorToGridDir(this.ai.dir),
    }
    const playerState = {
      x: Math.floor(this.player.pos.x / cellSize),
      y: Math.floor(this.player.pos.y / cellSize),
      dir: this.vectorToGridDir(this.player.dir),
    }

    const moves = this.getGridMoves(aiState.dir)
    const minShort = config.minShortClear
    const minTurnDistance =
      120 + this.speed * 0.25 * (this.difficulty === 'hard' ? 1.0 : this.difficulty === 'normal' ? 0.9 : 0.8)
    const turnCooldown = this.aiDistanceSinceTurn < minTurnDistance

    let bestDir: Vec | null = null
    let bestScore = -Infinity

    for (const move of moves) {
      const nextAi = this.applyGridMove(aiState, move, new Set(occupied), gridW, gridH)
      if (nextAi.dead) {
        continue
      }
      const shortClear = this.gridClearance(nextAi, gridW, gridH, occupied, minShort)
      if (shortClear < 2) {
        continue
      }
      const vor = this.gridVoronoiDiff(nextAi, playerState, occupied, gridW, gridH)
      const mob = this.gridMovesCount(nextAi, occupied, gridW, gridH)
      const score = vor * 2.5 + mob * 0.5 + shortClear * 0.3
      if (score > bestScore) {
        bestScore = score
        bestDir = move
      }
    }

    // Strong forward bias if safe and within cooldown
    if (turnCooldown) {
      const forward = moves[0]
      if (bestDir && this.isSameGridDir(forward, bestDir)) {
        return this.gridDirToVec(bestDir)
      }
      const forwardState = this.applyGridMove(aiState, forward, new Set(occupied), gridW, gridH)
      const forwardShort = this.gridClearance(forwardState, gridW, gridH, occupied, minShort)
      if (!forwardState.dead && forwardShort >= 2) {
        return this.gridDirToVec(forward)
      }
    }

    return bestDir ? this.gridDirToVec(bestDir) : null
  }

  private gridVoronoiDiff(ai: GridState, player: GridState, occupied: Set<string>, w: number, h: number) {
    type Owner = 'ai' | 'player' | 'neutral'
    const states = new Map<string, Owner>()
    const queue: Array<{ x: number; y: number; owner: Owner }> = [
      { x: ai.x, y: ai.y, owner: 'ai' },
      { x: player.x, y: player.y, owner: 'player' },
    ]

    const encode = (x: number, y: number) => `${x}:${y}`
    const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h

    while (queue.length) {
      const current = queue.shift()!
      const key = encode(current.x, current.y)
      if (states.has(key)) {
        const existing = states.get(key)!
        if (existing !== current.owner) {
          states.set(key, 'neutral')
        }
        continue
      }
      states.set(key, current.owner)

      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ]
      for (const n of neighbors) {
        if (!inBounds(n.x, n.y)) continue
        if (occupied.has(encode(n.x, n.y))) continue
        queue.push({ ...n, owner: current.owner })
      }
    }

    let aiOwned = 0
    let playerOwned = 0
    for (const v of states.values()) {
      if (v === 'ai') aiOwned += 1
      else if (v === 'player') playerOwned += 1
    }
    return aiOwned - playerOwned
  }

  private gridClearance(state: GridState, w: number, h: number, occupied: Set<string>, maxSteps: number) {
    const encode = (x: number, y: number) => `${x}:${y}`
    let pos = { x: state.x, y: state.y }
    let steps = 0
    while (steps < maxSteps) {
      const next = { x: pos.x + state.dir.x, y: pos.y + state.dir.y }
      if (next.x < 0 || next.y < 0 || next.x >= w || next.y >= h) {
        break
      }
      if (occupied.has(encode(next.x, next.y))) {
        break
      }
      pos = next
      steps += 1
    }
    return steps
  }

  private buildOccupiedGrid(w: number, h: number, cellSize: number) {
    const occupied = new Set<string>()
    const encode = (x: number, y: number) => `${x}:${y}`

    const markSegment = (a: Vec, b: Vec) => {
      const ax = Math.floor(a.x / cellSize)
      const ay = Math.floor(a.y / cellSize)
      const bx = Math.floor(b.x / cellSize)
      const by = Math.floor(b.y / cellSize)
      const dx = Math.abs(bx - ax)
      const dy = -Math.abs(by - ay)
      const sx = ax < bx ? 1 : -1
      const sy = ay < by ? 1 : -1
      let err = dx + dy
      let x = ax
      let y = ay
      while (true) {
        if (x >= 0 && y >= 0 && x < w && y < h) {
          occupied.add(encode(x, y))
        }
        if (x === bx && y === by) break
        const e2 = 2 * err
        if (e2 >= dy) {
          err += dy
          x += sx
        }
        if (e2 <= dx) {
          err += dx
          y += sy
        }
      }
    }

    const markSegments = (segments: Segment[]) => {
      for (const seg of segments) {
        markSegment(seg.a, seg.b)
      }
    }

    markSegments(this.player.segments)
    markSegments(this.ai.segments)

    return occupied
  }

  private applyGridMove(state: GridState, dir: Vec, occupied?: Set<string>, w?: number, h?: number): GridState {
    const encode = (x: number, y: number) => `${x}:${y}`
    const next = {
      x: state.x + dir.x,
      y: state.y + dir.y,
      dir,
      dead: state.dead,
    }
    if (occupied && w !== undefined && h !== undefined) {
      if (next.x < 0 || next.y < 0 || next.x >= w || next.y >= h) {
        next.dead = true
        return next
      }
      if (occupied.has(encode(next.x, next.y))) {
        next.dead = true
        return next
      }
      occupied.add(encode(next.x, next.y))
    }
    return next
  }

  private getGridMoves(dir: Vec) {
    if (dir.x === 1) return [dir, { x: 0, y: -1 }, { x: 0, y: 1 }]
    if (dir.x === -1) return [dir, { x: 0, y: 1 }, { x: 0, y: -1 }]
    if (dir.y === 1) return [dir, { x: 1, y: 0 }, { x: -1, y: 0 }]
    return [dir, { x: -1, y: 0 }, { x: 1, y: 0 }]
  }

  private isSameGridDir(a: Vec, b: Vec) {
    return a.x === b.x && a.y === b.y
  }

  private gridDirToVec(dir: Vec): Vec {
    if (dir.x === 1) return DIRECTION_VECTORS.right
    if (dir.x === -1) return DIRECTION_VECTORS.left
    if (dir.y === 1) return DIRECTION_VECTORS.down
    return DIRECTION_VECTORS.up
  }

  private vectorToGridDir(dir: Vec): Vec {
    if (dir.x === 1) return { x: 1, y: 0 }
    if (dir.x === -1) return { x: -1, y: 0 }
    if (dir.y === 1) return { x: 0, y: 1 }
    return { x: 0, y: -1 }
  }

  private gridMovesCount(state: GridState, occupied: Set<string>, w: number, h: number) {
    const moves = this.getGridMoves(state.dir)
    const encode = (x: number, y: number) => `${x}:${y}`
    let count = 0
    for (const m of moves) {
      const nx = state.x + m.x
      const ny = state.y + m.y
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      if (occupied.has(encode(nx, ny))) continue
      count += 1
    }
    return count
  }

  private drawExplosions() {
    if (this.explosions.length === 0) {
      return
    }
    const ctx = this.ctx
    ctx.save()
    for (const explosion of this.explosions) {
      const alpha = 1 - explosion.life / explosion.ttl
      ctx.globalAlpha = alpha
      ctx.shadowColor = '#ff6b6b'
      ctx.shadowBlur = 22

      ctx.save()
      ctx.translate(explosion.origin.x, explosion.origin.y)
      for (const ring of explosion.rings) {
        ctx.globalAlpha = alpha * 0.9
        ctx.strokeStyle = 'rgba(255, 90, 90, 0.85)'
        ctx.lineWidth = ring.width
        ctx.beginPath()
        ctx.arc(0, 0, ring.radius, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()

      ctx.shadowColor = '#fff2b0'
      ctx.shadowBlur = 18
      for (const particle of explosion.particles) {
        const particleAlpha = 1 - particle.life / particle.ttl
        if (particleAlpha <= 0) {
          continue
        }
        ctx.globalAlpha = alpha * particleAlpha
        ctx.fillStyle = explosion.color
        ctx.beginPath()
        ctx.arc(particle.pos.x, particle.pos.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}

function isOpposite(a: Vec, b: Vec) {
  return a.x + b.x === 0 && a.y + b.y === 0
}

function isSameDirection(a: Vec, b: Vec) {
  return a.x === b.x && a.y === b.y
}

function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distancePointToSegment(p: Vec, a: Vec, b: Vec) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = p.x - a.x
  const apy = p.y - a.y
  const abLenSq = abx * abx + aby * aby

  if (abLenSq === 0) {
    return Math.hypot(apx, apy)
  }

  let t = (apx * abx + apy * aby) / abLenSq
  t = Math.max(0, Math.min(1, t))
  const closest = { x: a.x + abx * t, y: a.y + aby * t }
  return distance(p, closest)
}

function vectorToAngle(dir: Vec) {
  if (dir.x === 1) {
    return 0
  }
  if (dir.x === -1) {
    return Math.PI
  }
  if (dir.y === -1) {
    return -Math.PI / 2
  }
  return Math.PI / 2
}
