import React from 'react'
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Albums from './pages/Albums'
import AlbumDetail from './pages/AlbumDetail'
import Tags from './pages/Tags'
import Settings from './pages/Settings'
import Trash from './pages/Trash'
import TrashIcon from './components/icons/TrashIcon'
import { AlbumIcon, MediaIcon, SettingsIcon, TagIcon } from './components/icons/AppIcons'
import './styles/App.css'

function Navigation() {
  const location = useLocation()
  
  const isActive = (path) => location.pathname === path
  
  return (
    <nav className="sidebar">
      <div className="logo">
        <h2><MediaIcon size={20} className="logo-icon" /> 媒体管理器</h2>
      </div>
      <ul className="nav-menu">
        <li>
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            <span className="icon"><MediaIcon size={18} className="icon-svg" /></span>
            <span>媒体库</span>
          </Link>
        </li>
        <li>
          <Link to="/albums" className={isActive('/albums') ? 'active' : ''}>
            <span className="icon"><AlbumIcon size={18} className="icon-svg" /></span>
            <span>相册</span>
          </Link>
        </li>
        <li>
          <Link to="/tags" className={isActive('/tags') ? 'active' : ''}>
            <span className="icon"><TagIcon size={18} className="icon-svg" /></span>
            <span>标签</span>
          </Link>
        </li>
        <li>
          <Link to="/trash" className={isActive('/trash') ? 'active' : ''}>
            <span className="icon"><TrashIcon size={18} className="icon-svg" /></span>
            <span>回收站</span>
          </Link>
        </li>
        <li>
          <Link to="/settings" className={isActive('/settings') ? 'active' : ''}>
            <span className="icon"><SettingsIcon size={18} className="icon-svg" /></span>
            <span>设置</span>
          </Link>
        </li>
      </ul>
    </nav>
  )
}

function App() {
  return (
    <Router>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/albums" element={<Albums />} />
            <Route path="/albums/:id" element={<AlbumDetail />} />
            <Route path="/tags" element={<Tags />} />
            <Route path="/trash" element={<Trash />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
