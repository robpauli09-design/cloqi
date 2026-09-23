import {useEffect,useState} from 'react';
import {useBackend} from './BackendProvider';
import {demoBudget,demoDailyLimit} from '../services/demoBudget';
export function DemoBudgetNotice(){
 const {status}=useBackend(); const [budget,setBudget]=useState(demoBudget);
 useEffect(()=>{const update=()=>setBudget(demoBudget()); window.addEventListener('kloqi-demo-budget',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('kloqi-demo-budget',update);window.removeEventListener('storage',update);};},[]);
 if(!status?.demoAiEnabled)return null;
 const remaining=Math.max(0,demoDailyLimit-budget.used);
 return <div className="ai-connection-note" role="status"><strong>Echte KI · Demo-Kontingent: {remaining} von {demoDailyLimit} Anfragen heute übrig.</strong> {remaining===0?'Für heute aufgebraucht – morgen (UTC) geht es weiter. ':remaining<=2?'Dein Kontingent ist fast aufgebraucht. ':''}Ein gemeinsames Limit schützt die Demo: 3 Anfragen pro Minute und 50 pro UTC-Tag für alle Besucher.{budget.globalRemaining!==undefined?` Zuletzt global übrig: ${budget.globalRemaining}.`:''}</div>;
}
