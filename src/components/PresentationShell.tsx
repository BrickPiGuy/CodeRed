import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Expand, FlaskConical, Grid2X2, NotebookPen, X } from 'lucide-react'
import { slides } from '../data/slides'
import { SlideContent } from '../slides/SlideContent'
import { ForensicsDashboard } from './ForensicsDashboard'
import type { Analysis } from '../types/forensics'

type Props = { lab: boolean; setLab: (value: boolean) => void }

export function PresentationShell({ lab, setLab }: Props) {
  const [index, setIndex] = useState(0)
  const [overview, setOverview] = useState(false)
  const [notes, setNotes] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [sampleHistory, setSampleHistory] = useState('')
  const move = (offset: number) => setIndex(current => Math.max(0, Math.min(slides.length - 1, current + offset)))
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (lab || overview || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable || (event.key === ' ' && target.tagName === 'BUTTON')) return
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); move(1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lab, overview])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.()
  }
  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => { setLab(false); setIndex(0) }} aria-label="Go to opening slide"><span className="brand-mark">AF</span><span>A FEW GOOD <strong>UPLOADS</strong><small>THE METADATA INVESTIGATION</small></span></button>
      <div className="top-actions"><span className="case-label"><span /> CASE FILE 001</span><button className={lab ? 'lab-button active' : 'lab-button'} onClick={() => setLab(!lab)}>{lab ? <ArrowLeft size={16} /> : <FlaskConical size={16} />}{lab ? 'BACK TO PRESENTATION' : 'OPEN FORENSICS LAB'}</button></div>
    </header>
    {lab ? <ForensicsDashboard analysis={analysis} setAnalysis={setAnalysis} sampleHistory={sampleHistory} setSampleHistory={setSampleHistory} /> : <>
      <main className="slide-wrap" id="slide-content"><div className="slide-kicker"><span>THE CASE FILE</span><i /> {slides[index].section} <span className="kicker-number">{String(index + 1).padStart(2, '0')} / 12</span></div><SlideContent index={index} openLab={() => setLab(true)} /></main>
      {notes && <aside className="notes-panel"><div><NotebookPen size={16} /> PRESENTER NOTES <button onClick={() => setNotes(false)} aria-label="Close presenter notes"><X size={16} /></button></div><p>{slides[index].note}</p></aside>}
      {overview && <div className="modal-backdrop" onClick={() => setOverview(false)}><section className="overview" role="dialog" aria-modal="true" aria-label="Slide overview" onClick={event => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">THE CASE FILE</span><h2>Slide overview</h2></div><button className="icon-button" onClick={() => setOverview(false)} aria-label="Close overview"><X size={20} /></button></div><div className="overview-grid">{slides.map((slide, slideIndex) => <button key={slide.title} className={slideIndex === index ? 'overview-item selected' : 'overview-item'} onClick={() => { setIndex(slideIndex); setOverview(false) }}><span>{String(slideIndex + 1).padStart(2, '0')}</span><strong>{slide.title}</strong><small>{slide.section}</small></button>)}</div></section></div>}
      <footer className="presentation-footer"><div className="footer-left"><span className="live-dot" /> PRESENTATION MODE <span className="footer-divider" /> <span className="footer-hint">USE ARROW KEYS TO NAVIGATE</span></div><div className="footer-controls"><button className="icon-button" onClick={() => setOverview(true)} aria-label="Open slide overview" title="Slide overview"><Grid2X2 size={17} /></button><button className="icon-button" onClick={() => setNotes(!notes)} aria-label="Toggle presenter notes" title="Presenter notes" aria-pressed={notes}><NotebookPen size={17} /></button><button className="icon-button" onClick={toggleFullscreen} aria-label="Toggle fullscreen" title="Fullscreen"><Expand size={17} /></button><span className="footer-divider" /><button className="icon-button nav-arrow" onClick={() => move(-1)} disabled={index === 0} aria-label="Previous slide"><ChevronLeft size={20} /></button><span className="slide-count">{String(index + 1).padStart(2, '0')} <span>/</span> 12</span><button className="icon-button nav-arrow next" onClick={() => move(1)} disabled={index === slides.length - 1} aria-label="Next slide"><ChevronRight size={20} /></button></div><div className="progress-track"><div style={{ width: `${((index + 1) / slides.length) * 100}%` }} /></div></footer>
    </>}
  </div>
}