import { chooseAiDirection, DIFFICULTY_CONFIG, type Difficulty } from './ai'
import {
  distance,
  pointHitsSegments,
  type Segment,
  type Vec,
} from './collision'

export type { Difficulty }
export type RoundResult = 'player' | 'ai' | 'tie'
export type Direction = 'up' | 'down' | 'left' | 'right'

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
  tuning?: Partial<EngineTuning>
}

const BASE_SPEED = 150
const SPEED_STEP = 12
const SPEED_INTERVAL = 5
const MAX_SPEED = 350
const TRAIL_WIDTH = 6
const COLLISION_RADIUS = 5
const COLLISION_TOLERANCE = 1
const SPAWN_PADDING = 80
const GRID_STEP = 48
const CRASH_FLASH_DURATION = 0.6
const WALL_SHRINK_DURATION = 0.9
const MAX_MOVE_STEP = COLLISION_RADIUS + COLLISION_TOLERANCE

export type EngineTuning = {
  baseSpeed: number
  speedStep: number
  maxSpeed: number
  gridStep: number
}

const DEFAULT_TUNING: EngineTuning = {
  baseSpeed: BASE_SPEED,
  speedStep: SPEED_STEP,
  maxSpeed: MAX_SPEED,
  gridStep: GRID_STEP,
}

const COLORS = {
  player: '#2dd4ff',
  ai: '#ffb347',
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
  private tuning: EngineTuning
  private desiredTuning: EngineTuning

  private width = 0
  private height = 0
  private dpr = 1
  private arenaLocked = false

  private player: PlayerState
  private ai: PlayerState
  private playerImage: HTMLImageElement | null = null
  private aiImage: HTMLImageElement | null = null

  private running = false
  private rafId: number | null = null
  private lastTime = 0
  private speed = 0
  private speedTimer = 0
  private aiDecisionTimer = 0
  private paused = false
  private explosions: Explosion[] = []
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
    this.tuning = {
      ...DEFAULT_TUNING,
      ...(callbacks.tuning ?? {}),
    }
    this.desiredTuning = { ...this.tuning }

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
    this.unlockArena()
    this.applyLayout()
    this.tuning = { ...this.desiredTuning }
    this.resetRoundState()
    this.lockArena()
    this.running = true
    this.paused = false
  }

  reset() {
    this.unlockArena()
    this.applyLayout()
    this.tuning = { ...this.desiredTuning }
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

  setTuning(tuning: Partial<EngineTuning>) {
    this.desiredTuning = {
      ...this.desiredTuning,
      ...tuning,
    }
    if (!this.arenaLocked) {
      this.tuning = { ...this.desiredTuning }
    }
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
    if (this.arenaLocked) {
      return
    }
    if (this.applyLayout()) {
      this.resetRoundState()
    }
  }

  private applyLayout() {
    const rect = this.canvas.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    if (width < 2 || height < 2) {
      return false
    }

    const dpr = window.devicePixelRatio || 1
    const sameSize =
      Math.abs(width - this.width) < 0.5 &&
      Math.abs(height - this.height) < 0.5 &&
      dpr === this.dpr
    if (sameSize && this.canvas.width > 0 && this.canvas.height > 0) {
      return false
    }

    this.width = width
    this.height = height
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.floor(width * dpr))
    this.canvas.height = Math.max(1, Math.floor(height * dpr))
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return true
  }

  private lockArena() {
    this.arenaLocked = true
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
  }

  private unlockArena() {
    this.arenaLocked = false
    this.canvas.style.width = ''
    this.canvas.style.height = ''
  }

  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
    }
  }

  private resetRoundState() {
    this.speed = this.tuning.baseSpeed
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
      this.speed = Math.min(
        this.tuning.maxSpeed,
        this.speed + steps * this.tuning.speedStep,
      )
      this.speedTimer -= steps * SPEED_INTERVAL
    }

    this.updateAI(delta)

    const moveDistance = this.speed * delta
    const steps = Math.max(1, Math.ceil(moveDistance / MAX_MOVE_STEP))
    const stepDistance = moveDistance / steps

    for (let i = 0; i < steps; i += 1) {
      const nextPlayerPos = {
        x: this.player.pos.x + this.player.dir.x * stepDistance,
        y: this.player.pos.y + this.player.dir.y * stepDistance,
      }
      const nextAiPos = {
        x: this.ai.pos.x + this.ai.dir.x * stepDistance,
        y: this.ai.pos.y + this.ai.dir.y * stepDistance,
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
        return
      }
      if (playerHit) {
        this.spawnExplosion(nextPlayerPos, this.player.color)
        this.crashTimers.player = CRASH_FLASH_DURATION
        this.crashed.player = true
        this.startWallShrink('player')
        this.endRound('ai')
        return
      }
      if (aiHit) {
        this.spawnExplosion(nextAiPos, this.ai.color)
        this.crashTimers.ai = CRASH_FLASH_DURATION
        this.crashed.ai = true
        this.startWallShrink('ai')
        this.endRound('player')
        return
      }
    }
  }

  private updateAI(delta: number) {
    this.aiDecisionTimer -= delta
    if (this.aiDecisionTimer > 0) {
      return
    }

    const config = DIFFICULTY_CONFIG[this.difficulty]
    this.aiDecisionTimer = config.decisionInterval

    const chosen = chooseAiDirection(
      {
        width: this.width,
        height: this.height,
        speed: this.speed,
        ai: this.ai,
        player: this.player,
        wouldCollide: (point) => this.checkCollision(point, this.ai, this.player),
      },
      config,
    )
    if (chosen && !isSameDirection(this.ai.dir, chosen)) {
      this.applyDirection(this.ai, { ...chosen })
    }
  }

  private checkCollision(point: Vec, self: PlayerState, other: PlayerState) {
    const radius = COLLISION_RADIUS + COLLISION_TOLERANCE

    if (
      point.x <= radius ||
      point.x >= this.width - radius ||
      point.y <= radius ||
      point.y >= this.height - radius
    ) {
      return true
    }

    if (pointHitsSegments(point, other.segments, radius)) {
      return true
    }

    if (self.segments.length > 2) {
      const selfSegments = self.segments.slice(0, -2) // ignore current growing + most recent completed turn
      if (pointHitsSegments(point, selfSegments, radius)) {
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

    for (let x = 0; x <= this.width; x += this.tuning.gridStep) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, this.height)
    }
    for (let y = 0; y <= this.height; y += this.tuning.gridStep) {
      ctx.moveTo(0, y)
      ctx.lineTo(this.width, y)
    }
    ctx.stroke()

    // Draw arena border
    ctx.strokeStyle = 'rgba(45, 212, 255, 0.4)'
    ctx.lineWidth = 3
    ctx.shadowColor = 'rgba(45, 212, 255, 0.6)'
    ctx.shadowBlur = 8
    ctx.strokeRect(1.5, 1.5, this.width - 3, this.height - 3)
    ctx.shadowBlur = 0
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

    const sprite = player.id === 'player' ? this.playerImage : this.aiImage
    if (sprite) {
      this.drawCycleSprite(sprite, this.crashed[player.id], flashAlpha)
    } else {
      ctx.fillStyle = player.color
      ctx.beginPath()
      ctx.moveTo(13, 0)
      ctx.lineTo(-10, -7)
      ctx.lineTo(-10, 7)
      ctx.closePath()
      ctx.fill()
      if (flashAlpha > 0) {
        ctx.globalAlpha = flashAlpha
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.moveTo(13, 0)
        ctx.lineTo(-10, -7)
        ctx.lineTo(-10, 7)
        ctx.closePath()
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()
  }

  private drawCycleSprite(
    img: HTMLImageElement,
    crashed: boolean,
    flashAlpha: number,
  ) {
    const ctx = this.ctx
    const scale = 0.055
    const w = img.width * scale
    const h = img.height * scale
    const fadeAlpha = crashed ? Math.max(0, flashAlpha) : 1
    ctx.globalAlpha = fadeAlpha
    ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h)
    if (flashAlpha > 0) {
      ctx.globalAlpha = flashAlpha
      ctx.globalCompositeOperation = 'screen'
      ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = 1
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
