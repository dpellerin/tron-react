export function OrientationLock() {
  return (
    <div className="orientation-lock" aria-live="polite" aria-hidden>
      <div className="orientation-lock__card">
        <div className="orientation-lock__title">Rotate your device</div>
        <div className="orientation-lock__subtitle">Please use portrait mode to play.</div>
      </div>
    </div>
  )
}
