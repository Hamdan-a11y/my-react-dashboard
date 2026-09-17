import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import Login from './components/Login'
import { supabase } from './supabaseClient'
import { Zap, Sun, Moon } from 'lucide-react'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [initialError, setInitialError] = useState('')

  // 🌓 Theme State (persisted in localStorage, auto-detects OS preference)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('app_theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches 
      ? 'light' 
      : 'dark'
  })

  // Synchronize theme attribute on root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('app_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    // Check if URL hash contains an error from Supabase redirect
    const hash = window.location.hash
    if (hash.includes('error=')) {
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
      const errorCode = hashParams.get('error_code')
      if (errorCode === 'otp_expired') {
        setInitialError('This password reset link has expired or was already used. Please request a new link.')
      } else {
        const desc = hashParams.get('error_description')
        setInitialError(desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : 'Authentication link failed. Please try again.')
      }
      // Clean the ugly error string from the browser address bar
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (
      hash.includes('type=recovery') ||
      window.location.search.includes('type=recovery')
    ) {
      setIsPasswordRecovery(true)
    }

    // 1. Check if user is already logged in on initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // 2. Listen to real-time auth events from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 3. Real Cloud Logout
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setIsPasswordRecovery(false)
    setInitialError('')
  }

  // ✨ Polished Splash / Loading Screen (No blank/flashing page)
  if (loading) {
    return (
      <div className="splash-container">
        <div className="splash-glow"></div>
        <div className="splash-card">
          <div className="splash-icon-box">
            <Zap size={32} />
          </div>
          <h2 className="splash-brand">my-react-app</h2>
          <p className="splash-sub">Connecting to secure cloud services...</p>
          <div className="splash-progress-track">
            <div className="splash-progress-bar"></div>
          </div>
          <div className="splash-status-badge">
            <span className="splash-status-dot"></span>
            Checking active session
          </div>
        </div>
      </div>
    )
  }

  // Get the user's name from cloud metadata or fallback to email
  const userName =
    session?.user?.user_metadata?.full_name ||
    session?.user?.email?.split('@')[0] ||
    'User'

  return (
    <div>
      {session && !isPasswordRecovery ? (
        <Dashboard
          session={session}
          user={userName}
          onLogout={handleLogout}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      ) : (
        <>
          {/* Floating Theme Switch for Login & Forgot Password screens */}
          <button
            className="theme-toggle-floating"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun size={20} className="theme-icon" />
            ) : (
              <Moon size={20} className="theme-icon" />
            )}
          </button>

          <Login
            isRecoveryMode={isPasswordRecovery}
            initialError={initialError}
            onPasswordResetComplete={() => {
              setIsPasswordRecovery(false)
              setInitialError('')
              // Clean up the URL hash/query
              window.history.replaceState({}, document.title, window.location.pathname)
            }}
          />
        </>
      )}
    </div>
  )
}

export default App
