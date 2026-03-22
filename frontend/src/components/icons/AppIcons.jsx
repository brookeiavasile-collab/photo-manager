import React from 'react'

function baseSvg(children, { size = 18, strokeWidth = 1.8, className = '' } = {}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {typeof children === 'function' ? children(strokeWidth) : children}
    </svg>
  )
}

export function MediaIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="16.5" cy="9" r="1.5" fill="currentColor" />
      <path d="M7 16L10.5 12.5L13 15L15.5 12L17 13.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ), props)
}

export function PhotoTypeIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="16.5" cy="9" r="1.5" fill="currentColor" />
      <path d="M7 16L10.5 12.5L13 15L15.5 12L17 13.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ), props)
}

export function VideoTypeIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M10 9L15 12L10 15V9Z" fill="currentColor" />
    </>
  ), props)
}

export function AlbumIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <path d="M4 8.5C4 7.67 4.67 7 5.5 7H10L11.5 9H18.5C19.33 9 20 9.67 20 10.5V17.5C20 18.33 19.33 19 18.5 19H5.5C4.67 19 4 18.33 4 17.5V8.5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M4 10H20" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ), props)
}

export function TagIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <path d="M10 5H6.5C5.67 5 5 5.67 5 6.5V10L12.5 18L18 12.5L10 5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </>
  ), props)
}

export function SettingsIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M12 4.5V3M12 21V19.5M19.5 12H21M3 12H4.5M17.3 6.7L18.4 5.6M5.6 18.4L6.7 17.3M17.3 17.3L18.4 18.4M5.6 5.6L6.7 6.7" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ), props)
}

export function RestoreIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <path d="M8 8H4V4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9C6.4 6.6 9 5 12 5C16.42 5 20 8.58 20 13C20 17.42 16.42 21 12 21C8.54 21 5.59 18.8 4.49 15.72" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ), props)
}

export function FolderPathIcon(props) {
  return baseSvg((strokeWidth) => (
    <path d="M4 8.5C4 7.67 4.67 7 5.5 7H10L11.5 9H18.5C19.33 9 20 9.67 20 10.5V17.5C20 18.33 19.33 19 18.5 19H5.5C4.67 19 4 18.33 4 17.5V8.5Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
  ), props)
}

export function SyncIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <path d="M6 8C7.46 6.15 9.62 5 12 5C15.38 5 18.3 7.3 19.1 10.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M18 6V10.5H13.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 16C16.54 17.85 14.38 19 12 19C8.62 19 5.7 16.7 4.9 13.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M6 18V13.5H10.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ), props)
}

export function RefreshIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <path d="M19 8V4H15" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 16V20H9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 11C17.31 7.91 14.93 5.55 11.88 5.04C8.82 4.52 5.86 5.95 4.22 8.58" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M6 13C6.69 16.09 9.07 18.45 12.12 18.96C15.18 19.48 18.14 18.05 19.78 15.42" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ), props)
}

export function CheckIcon(props) {
  return baseSvg((strokeWidth) => (
    <path d="M5 12.5L9.2 16.5L19 7.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  ), props)
}

export function PlusIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <path d="M12 5V19" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M5 12H19" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </>
  ), props)
}

export function PlayIcon(props) {
  return baseSvg(() => (
    <path d="M9 7.5L17 12L9 16.5V7.5Z" fill="currentColor" />
  ), props)
}

export function ViewIcon(props) {
  return baseSvg((strokeWidth) => (
    <>
      <path d="M2.5 12C4.5 8.2 7.8 6 12 6C16.2 6 19.5 8.2 21.5 12C19.5 15.8 16.2 18 12 18C7.8 18 4.5 15.8 2.5 12Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth={strokeWidth} />
    </>
  ), props)
}
