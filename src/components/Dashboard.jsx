import { useState, useEffect } from 'react'
import './Dashboard.css'
import { supabase } from '../supabaseClient'
import { 
  LogOut, 
  ListTodo, 
  CheckCircle2, 
  TrendingUp, 
  Trash2, 
  Plus, 
  ShieldCheck, 
  Activity, 
  Calendar,
  Loader2,
  AlertCircle,
  Clock,
  UserCheck,
  Sun,
  Moon,
  Search,
  X,
  Pencil,
  Check,
  CheckCheck
} from 'lucide-react'

function Dashboard({ session, user, onLogout, theme, toggleTheme }) {
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [newTaskInput, setNewTaskInput] = useState('')

  // 🔍 Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'active' | 'completed'

  // ✏️ Inline Editing State
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editingTaskText, setEditingTaskText] = useState('')

  // ⚡ Batch Action Loading State
  const [isBatchOperating, setIsBatchOperating] = useState(false)

  const userId = session?.user?.id
  const userEmail = session?.user?.email || ''
  const createdAt = session?.user?.created_at
  const lastSignIn = session?.user?.last_sign_in_at

  // 1. Fetch real tasks from Supabase
  const fetchTasks = async () => {
    if (!userId) {
      setLoadingTasks(false)
      return
    }

    setLoadingTasks(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('not find the table')) {
          setTableMissing(true)
        } else {
          setErrorMessage(error.message)
        }
      } else {
        setTasks(data || [])
        setTableMissing(false)
      }
    } catch (err) {
      console.error('Error fetching tasks from Supabase:', err)
      setErrorMessage(err.message || 'Failed to load tasks.')
    } finally {
      setLoadingTasks(false)
    }
  }

  // Initial load + Realtime subscription
  useEffect(() => {
    fetchTasks()

    if (!userId) return

    // Supabase Real-time updates
    const channel = supabase
      .channel(`public:tasks:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchTasks()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // 2. Add real task to Supabase
  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTaskInput.trim() || isSubmitting) return

    const taskText = newTaskInput.trim()
    setNewTaskInput('')
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([
          {
            user_id: userId,
            text: taskText,
            completed: false,
          }
        ])
        .select()

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('not find the table')) {
          setTableMissing(true)
        } else {
          setErrorMessage(error.message)
        }
      } else if (data && data[0]) {
        setTasks(prev => [data[0], ...prev])
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to add task.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 3. Toggle task completion in Supabase
  const toggleTask = async (id, currentStatus) => {
    // Optimistic UI update
    setTasks(prev =>
      prev.map(task =>
        task.id === id ? { ...task, completed: !currentStatus } : task
      )
    )

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ completed: !currentStatus })
        .eq('id', id)

      if (error) {
        // Revert on failure
        setTasks(prev =>
          prev.map(task =>
            task.id === id ? { ...task, completed: currentStatus } : task
          )
        )
        setErrorMessage(error.message)
      }
    } catch (err) {
      setErrorMessage(err.message)
    }
  }

  // 4. Delete task from Supabase
  const handleDeleteTask = async (id) => {
    const previous = [...tasks]
    setTasks(prev => prev.filter(task => task.id !== id))

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)

      if (error) {
        setTasks(previous)
        setErrorMessage(error.message)
      }
    } catch (err) {
      setTasks(previous)
      setErrorMessage(err.message)
    }
  }

  // 5. ✏️ Start Editing Task
  const startEditing = (task) => {
    setEditingTaskId(task.id)
    setEditingTaskText(task.text)
  }

  // 6. ✏️ Cancel Editing Task
  const cancelEditing = () => {
    setEditingTaskId(null)
    setEditingTaskText('')
  }

  // 7. ✏️ Save Edited Task to Supabase
  const saveEditing = async (id) => {
    const trimmed = editingTaskText.trim()
    if (!trimmed) return

    const originalText = tasks.find(t => t.id === id)?.text

    // Optimistic update
    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, text: trimmed } : t))
    )
    setEditingTaskId(null)

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ text: trimmed })
        .eq('id', id)

      if (error) {
        // Revert on failure
        setTasks(prev =>
          prev.map(t => (t.id === id ? { ...t, text: originalText } : t))
        )
        setErrorMessage(error.message)
      }
    } catch (err) {
      setErrorMessage(err.message)
    }
  }

  // 8. ⚡ Batch Action: Mark All Active as Done
  const handleMarkAllDone = async () => {
    const activeTasks = tasks.filter(t => !t.completed)
    if (activeTasks.length === 0 || isBatchOperating) return

    const previous = [...tasks]
    // Optimistic update
    setTasks(prev => prev.map(t => ({ ...t, completed: true })))
    setIsBatchOperating(true)

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ completed: true })
        .eq('user_id', userId)
        .eq('completed', false)

      if (error) {
        setTasks(previous)
        setErrorMessage(error.message)
      }
    } catch (err) {
      setTasks(previous)
      setErrorMessage(err.message)
    } finally {
      setIsBatchOperating(false)
    }
  }

  // 9. ⚡ Batch Action: Clear All Completed Tasks
  const handleClearCompleted = async () => {
    const completedTasks = tasks.filter(t => t.completed)
    if (completedTasks.length === 0 || isBatchOperating) return

    if (!window.confirm(`Are you sure you want to delete ${completedTasks.length} completed task(s)?`)) {
      return
    }

    const previous = [...tasks]
    // Optimistic update
    setTasks(prev => prev.filter(t => !t.completed))
    setIsBatchOperating(true)

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('user_id', userId)
        .eq('completed', true)

      if (error) {
        setTasks(previous)
        setErrorMessage(error.message)
      }
    } catch (err) {
      setTasks(previous)
      setErrorMessage(err.message)
    } finally {
      setIsBatchOperating(false)
    }
  }

  // Calculations
  const activeCount = tasks.filter(t => !t.completed).length
  const completedCount = tasks.filter(t => t.completed).length
  const completionRate = tasks.length > 0 
    ? Math.round((completedCount / tasks.length) * 100) 
    : 0

  // 🔎 Filtered Tasks based on active tab and search query
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.text.toLowerCase().includes(searchQuery.toLowerCase().trim())
    if (filterTab === 'active') return matchesSearch && !task.completed
    if (filterTab === 'completed') return matchesSearch && task.completed
    return matchesSearch
  })

  const initials = (user || 'User')
    .split(' ')
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  // Format dates
  const formatDate = (dateString) => {
    if (!dateString) return 'Just now'
    const d = new Date(dateString)
    return d.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  // SVG circular completion progress calculation
  const circleRadius = 38
  const circleCircumference = 2 * Math.PI * circleRadius
  const circleStrokeOffset = circleCircumference - (completionRate / 100) * circleCircumference

  return (
    <div className="dashboard-page">
      {/* Precision Top Navigation Bar */}
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <span className="brand-name">React App-2</span>
        </div>

        <div className="nav-user-area">
          {toggleTheme && (
            <button 
              className="theme-toggle-nav" 
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={17} className="theme-icon" /> : <Moon size={17} className="theme-icon" />}
            </button>
          )}

          <div className="user-badge">
            <div className="user-avatar">{initials}</div>
            <span className="user-name">{user || 'User'}</span>
          </div>

          <button 
            className="logout-btn-nav" 
            onClick={onLogout}>
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="dashboard-content">
        {/* Welcome Header */}
        <div className="welcome-header">
          <div className="welcome-title">
            <h1>Welcome back, {user || 'User'}</h1>
            <p className="welcome-meta">{userEmail}</p>
          </div>
        </div>

        {/* Database Setup Notice if table not created yet */}
        {tableMissing && (
          <div className="db-setup-banner">
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <div className="db-setup-text">
              <strong>Database Configuration Notice:</strong> The <code>tasks</code> table has not been initialized in your Supabase project.
              Open your Supabase <strong>SQL Editor</strong> and run the schema setup query to activate persistent cloud storage.
            </div>
            <button 
              className="refresh-btn" 
              onClick={fetchTasks}
              title="Check again"
            >
              Retry Connection
            </button>
          </div>
        )}

        {errorMessage && !tableMissing && (
          <div className="db-setup-banner error-state">
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <div className="db-setup-text">
              <strong>System Notice:</strong> {errorMessage}
            </div>
          </div>
        )}

        {/* Asymmetrical Bento Grid */}
        <div className="stats-bento-grid">
          {/* Bento Item 1: Circular Progress Meter */}
          <div className="bento-box hero-progress-card">
            <div className="bento-header">
              <span className="bento-label">Completion Velocity</span>
            </div>
            
            <div className="hero-progress-body">
              <div className="circular-progress-wrap">
                <svg className="progress-ring" width="96" height="96" viewBox="0 0 96 96">
                  <circle
                    className="progress-ring-track"
                    cx="48"
                    cy="48"
                    r={circleRadius}
                    fill="transparent"
                    strokeWidth="8"
                  />
                  <circle
                    className="progress-ring-fill"
                    cx="48"
                    cy="48"
                    r={circleRadius}
                    fill="transparent"
                    strokeWidth="8"
                    strokeDasharray={circleCircumference}
                    strokeDashoffset={circleStrokeOffset}
                  />
                </svg>
                <div className="progress-ring-text">
                  <span className="progress-rate-num">{completionRate}</span>
                  <span className="progress-rate-pct">%</span>
                </div>
              </div>

              <div className="hero-progress-meta">
                <div className="hero-stat-row">
                  <span className="hero-stat-text">Completed</span>
                  <strong>{completedCount} tasks</strong>
                </div>
                <div className="hero-stat-row">
                  <span className="hero-stat-text">Remaining</span>
                  <strong>{activeCount} tasks</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Bento Item 2: Active Tasks */}
          <div className="bento-box telemetry-box">
            <div className="bento-header">
              <span className="bento-label">Active Tasks</span>
            </div>
            <div className="bento-metric-block">
              <span className="bento-val">{activeCount}</span>
              <span className="bento-sub">Active tasks requiring focus</span>
            </div>
          </div>

          {/* Bento Item 3: Total Cloud Volume */}
          <div className="bento-box telemetry-box">
            <div className="bento-header">
              <span className="bento-label">Total Items</span>
            </div>
            <div className="bento-metric-block">
              <span className="bento-val">{tasks.length}</span>
              <span className="bento-sub">Total synchronized items</span>
            </div>
          </div>
        </div>

        {/* 2-Column Section: Task Manager & Real Activity */}
        <div className="dashboard-grid">
          {/* Task Manager Panel */}
          <div className="panel-card tasks-primary-panel">
            <div className="panel-header">
              <div className="panel-header-left">
                <h3>Tasks</h3>
                <span className="panel-sub-count">
                  {filteredTasks.length} {filteredTasks.length === 1 ? 'item' : 'items'}
                </span>
              </div>
            </div>

            {/* Task Add Bar with Tactile Input */}
            <form className="task-input-bar" onSubmit={handleAddTask}>
              <div className="task-input-wrapper">
                <input
                  type="text"
                  placeholder={tableMissing ? "Initialize table in Supabase..." : "Create a new task... (Press Enter)"}
                  value={newTaskInput}
                  onChange={(e) => setNewTaskInput(e.target.value)}
                  disabled={isSubmitting || tableMissing}
                />
              </div>
              <button 
                type="submit" 
                className="add-task-button"
                disabled={isSubmitting || tableMissing || !newTaskInput.trim()}
              >
                {isSubmitting ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                <span>{isSubmitting ? 'Saving...' : 'Add Task'}</span>
              </button>
            </form>

            {/* 🔎 Search Bar & Segmented Filter Tabs */}
            <div className="tasks-control-bar">
              <div className="tasks-search-box">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter tasks by keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    type="button" 
                    className="clear-search-btn"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="filter-tabs">
                <button
                  type="button"
                  className={`filter-tab-btn ${filterTab === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterTab('all')}
                >
                  <span>All</span>
                  <span className="tab-count">{tasks.length}</span>
                </button>
                <button
                  type="button"
                  className={`filter-tab-btn ${filterTab === 'active' ? 'active' : ''}`}
                  onClick={() => setFilterTab('active')}
                >
                  <span>Active</span>
                  <span className="tab-count">{activeCount}</span>
                </button>
                <button
                  type="button"
                  className={`filter-tab-btn ${filterTab === 'completed' ? 'active' : ''}`}
                  onClick={() => setFilterTab('completed')}
                >
                  <span>Done</span>
                  <span className="tab-count">{completedCount}</span>
                </button>
              </div>
            </div>

            {/* Tasks List with 3-Layer Motion */}
            {loadingTasks ? (
              <div className="tasks-loading-state">
                <Loader2 size={24} className="spin loading-spinner" />
                <p>Synchronizing tasks with Supabase...</p>
              </div>
            ) : (
              <>
                <ul className="task-items-list">
                  {filteredTasks.length === 0 ? (
                    <li className="task-empty-state">
                      <p>
                        {tableMissing 
                          ? 'Create the table in your Supabase SQL Editor to start saving tasks.'
                          : searchQuery 
                            ? 'No tasks match your search filter.'
                            : filterTab === 'completed' 
                              ? 'No completed tasks yet. Mark items done as you finish them!' 
                              : filterTab === 'active' 
                                ? 'All tasks complete! Add a new item to keep momentum.' 
                                : 'No tasks in your workspace. Capture your first thought above.'}
                      </p>
                    </li>
                  ) : (
                    filteredTasks.map((task, index) => (
                      <li 
                        key={task.id} 
                        className={`task-row ${task.completed ? 'is-completed' : ''}`}
                        style={{ animationDelay: `${Math.min(index * 25, 200)}ms` }}
                      >
                        {editingTaskId === task.id ? (
                          /* ✏️ Inline Editing Mode */
                          <div className="inline-edit-box">
                            <input
                              type="text"
                              className="inline-edit-input"
                              value={editingTaskText}
                              autoFocus
                              onChange={(e) => setEditingTaskText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditing(task.id)
                                if (e.key === 'Escape') cancelEditing()
                              }}
                            />
                            <div className="inline-edit-actions">
                              <button
                                type="button"
                                className="inline-action-btn save"
                                onClick={() => saveEditing(task.id)}
                                title="Save (Enter)"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                className="inline-action-btn cancel"
                                onClick={cancelEditing}
                                title="Cancel (Esc)"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Standard Row Display */
                          <>
                            <label className="task-left">
                              <div className={`custom-checkbox ${task.completed ? 'checked' : ''}`}>
                                <input
                                  type="checkbox"
                                  className="task-checkbox-input"
                                  checked={Boolean(task.completed)}
                                  onChange={() => toggleTask(task.id, task.completed)}
                                />
                                {task.completed && <Check size={12} className="check-svg" />}
                              </div>
                              <span 
                                className={`task-text ${task.completed ? 'completed' : ''}`}
                                onDoubleClick={() => startEditing(task)}
                                title="Double click to edit"
                              >
                                {task.text}
                              </span>
                            </label>

                            <div className="task-actions-group">
                              <button
                                type="button"
                                className="task-action-btn edit"
                                onClick={() => startEditing(task)}
                                title="Edit task (or double-click text)"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                className="task-action-btn delete"
                                onClick={() => handleDeleteTask(task.id)}
                                title="Delete task from cloud"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))
                  )}
                </ul>

                {/* ⚡ Batch Actions Toolbar */}
                {tasks.length > 0 && (
                  <div className="batch-actions-bar">
                    {activeCount > 0 && (
                      <button
                        type="button"
                        className="batch-action-btn"
                        onClick={handleMarkAllDone}
                        disabled={isBatchOperating}
                      >
                        <CheckCheck size={14} />
                        Mark all done ({activeCount})
                      </button>
                    )}

                    {completedCount > 0 && (
                      <button
                        type="button"
                        className="batch-action-btn danger"
                        onClick={handleClearCompleted}
                        disabled={isBatchOperating}
                      >
                        <Trash2 size={14} />
                        Clear completed ({completedCount})
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Telemetry & Live Account Status Panel */}
          <div className="panel-card activity-telemetry-panel">
            <div className="panel-header">
              <h3>System Telemetry</h3>
            </div>

            <div className="activity-list">
              <div className="activity-item">
                <div className="activity-icon">
                  <UserCheck size={16} />
                </div>
                <div className="activity-info">
                  <p>Authenticated Profile</p>
                  <span>{userEmail}</span>
                </div>
              </div>

              <div className="activity-item">
                <div className="activity-icon">
                  <ShieldCheck size={16} />
                </div>
                <div className="activity-info">
                  <p>Security Handshake</p>
                  <span>{formatDate(lastSignIn)}</span>
                </div>
              </div>

              <div className="activity-item">
                <div className="activity-icon">
                  <Calendar size={16} />
                </div>
                <div className="activity-info">
                  <p>Account Inception</p>
                  <span>{formatDate(createdAt)}</span>
                </div>
              </div>

              <div className="activity-item">
                <div className="activity-icon">
                  <Activity size={16} />
                </div>
                <div className="activity-info">
                  <p>Real-time Replication</p>
                  <span>
                    {tableMissing ? 'Schema Setup Pending' : 'Subscribed to WebSocket Stream'}
                  </span>
                </div>
              </div>
            </div>

            <div className="telemetry-footer-note">
              <Clock size={13} />
              <span>End-to-end encrypted session</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
