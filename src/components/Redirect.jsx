import { useEffect } from 'react'
import { navigate } from '../lib/router'

export default function Redirect({ to }) {
  useEffect(() => {
    navigate(to)
  }, [to])
  return null
}
