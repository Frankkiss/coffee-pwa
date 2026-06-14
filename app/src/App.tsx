import './App.css'
import { AuthPanel } from './features/auth/AuthPanel'
import { OnlineStatus } from './pwa/OnlineStatus'

function App() {
  return (
    <main className="app-shell">
      <OnlineStatus />
      <AuthPanel />
    </main>
  )
}

export default App
