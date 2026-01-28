import { useMediaQuery } from './useMediaQuery'

const MOBILE_QUERY = '(max-width: 820px), (pointer: coarse)'

export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY)
}
