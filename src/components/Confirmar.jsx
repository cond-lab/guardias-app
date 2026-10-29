import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

// Sustituye a window.confirm con un modal propio: `if (!(await confirmar('¿Seguro?'))) return`
const ConfirmarContext = createContext(null)

export function ConfirmarProvider({ children }) {
  const [peticion, setPeticion] = useState(null)
  const botonOk = useRef(null)

  const confirmar = useCallback((mensaje, { titulo = 'Confirmar', boton = 'Aceptar', peligro = false } = {}) =>
    new Promise(resolve => setPeticion({ mensaje, titulo, boton, peligro, resolve })), [])

  function responder(valor) {
    peticion?.resolve(valor)
    setPeticion(null)
  }

  useEffect(() => {
    if (!peticion) return
    botonOk.current?.focus()
    const tecla = e => { if (e.key === 'Escape') responder(false) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  return (
    <ConfirmarContext.Provider value={confirmar}>
      {children}
      {peticion && (
        <div className="modal-overlay" style={{ zIndex: 300 }} onClick={e => e.target === e.currentTarget && responder(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo" style={{ maxWidth: 440 }}>
            <div className="modal-header"><span id="confirmar-titulo">{peticion.titulo}</span></div>
            <div className="modal-body" style={{ whiteSpace: 'pre-line' }}>{peticion.mensaje}</div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => responder(false)}>Cancelar</button>
              <button ref={botonOk} className={`btn ${peticion.peligro ? 'btn-danger' : 'btn-primary'}`} onClick={() => responder(true)}>
                {peticion.boton}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmarContext.Provider>
  )
}

export const useConfirmar = () => useContext(ConfirmarContext)
