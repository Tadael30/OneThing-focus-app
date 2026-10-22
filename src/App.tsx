import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'
import OneThing from './OneThing'

function App() {
  const [count, setCount] = useState(0)

  return (
    <OneThing />
  )
}

export default App
