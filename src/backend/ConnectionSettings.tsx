import {CheckCircle2,Cloud,RefreshCw} from 'lucide-react';
import {useBackend} from './BackendProvider';
export function ConnectionSettings(){
 const {status,error,refresh}=useBackend();
 return <section className="panel settings-panel connection-panel"><div className="connection-heading"><Cloud size={23}/><h2>Backend & KI</h2><button className="icon-button" aria-label="Verbindung erneut prüfen" onClick={()=>void refresh()}><RefreshCw size={18}/></button></div>
 <ul className="connection-status"><li><span className={status?'connected':''}><CheckCircle2 size={17}/></span>API<strong>{status?'Erreichbar':'Nicht erreichbar'}</strong></li><li><span className={status?.authConfigured?'connected':''}><CheckCircle2 size={17}/></span>Supabase<strong>{status?.authConfigured?'Konfiguriert':'Noch nicht eingerichtet'}</strong></li><li><span className={status?.aiConfigured?'connected':''}><CheckCircle2 size={17}/></span>OpenAI<strong>{status?.aiConfigured?status.model:'Schlüssel fehlt'}</strong></li></ul>
 <p className="ai-connection-note">Du bist mit einem Prototyp-Zugang angemeldet. Deine Aufgaben und Einstellungen bleiben getrennt nach Benutzer in diesem Browser. CLOQI AI verwendet gekennzeichnete Demo-Antworten.</p>
 <p className="form-hint">Für die spätere Cloud-Version ist das Backend vorbereitet. Der OpenAI-Schlüssel gehört ausschließlich in die Servervariable <code>OPENAI_API_KEY</code> – lokal in <code>.env</code> oder in die Vercel-Einstellungen.</p>{error&&<p className="ai-error-message" role="alert">{error}</p>}</section>;
}
