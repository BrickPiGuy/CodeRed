import { useState } from 'react'
import { PresentationShell } from './components/PresentationShell'

export function App() {
  const [lab, setLab] = useState(false)
  return <PresentationShell lab={lab} setLab={setLab} />
}