import { useEffect, useState } from 'react'

export function useMediaQuery(query: string, defaultState = false) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultState
    }
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const media = window.matchMedia(query)
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    media.addEventListener('change', handleChange)
    return () => {
      media.removeEventListener('change', handleChange)
    }
  }, [query])

  return matches
}
