import { Alert, Card, EmptyState } from '../ui';
import { BookOpen } from '../icons';
import MathExpression from './MathExpression';
import RecognitionStatusBadge from './RecognitionStatusBadge';
import UncertaintyBadge from './UncertaintyBadge';

function failureText(recognition){return recognition?.failureMessage||'The complete lesson could not be compiled. Please try again.';}

export default function CompiledLessonRecognition({ recognition, selectedPage, onSelectPage }) {
  const status=recognition?.status||'NOT_STARTED';
  const result=recognition?.structuredResult;
  const pages=result?.pages||recognition?.pages||[];
  return <section className="mt-5" aria-labelledby="compiled-recognition-title">
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="compiled-recognition-title" className="text-lg font-bold text-slate-900 dark:text-white">Compiled Lesson Recognition</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">All whiteboard pages are analyzed together while their original order stays intact.</p></div><RecognitionStatusBadge status={status}/></div>
      {recognition?.hasPreviousResult&&<Alert type="warning" className="mt-4 mb-0">The previous compilation remains visible while the newest attempt is {status==='FAILED'?'unavailable':'processing'}.</Alert>}
      {['PENDING','PROCESSING'].includes(status)&&!result&&<div className="mt-5 rounded-xl bg-info-subtle p-4 text-sm text-muted-foreground">The recognition worker is reading the complete page sequence…</div>}
      {status==='FAILED'&&!result&&<Alert type="error" className="mt-4 mb-0">{failureText(recognition)}</Alert>}
      {!recognition&&<EmptyState icon={<BookOpen size={22}/>} title="Lesson not compiled yet" body="Use Process Complete Lesson to analyze the ordered capture album as one sequence."/>}
      {result&&<div className="mt-5">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Compiled page navigation">{pages.map(page=><button key={page.captureId||page.pageNumber} type="button" onClick={()=>onSelectPage(page.pageNumber)} className={`min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedPage===page.pageNumber?'bg-primary text-primary-foreground':'bg-secondary text-muted-foreground hover:bg-primary-subtle hover:text-primary-subtle-foreground'}`}>Page {page.pageNumber}</button>)}</div>
        <div className="max-h-[680px] space-y-4 overflow-y-auto overscroll-contain pr-1 sm:pr-2">{pages.map(page=><article key={page.captureId||page.pageNumber} id={`recognized-page-${page.pageNumber}`} className={`rounded-2xl border p-3 sm:p-4 ${selectedPage===page.pageNumber?'border-primary/40 bg-primary-subtle':'border-border bg-card/45'}`}>
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Page {page.pageNumber}</h3>
          <div className="space-y-2">{page.blocks?.length?page.blocks.map((block,index)=><div key={`${block.order}-${index}`} className="rounded-xl bg-white/70 p-3 dark:bg-white/[.045]">{block.type==='math'?<MathExpression latex={block.latex}/>:<p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{block.text}</p>}{block.uncertain&&<div className="mt-2"><UncertaintyBadge reason={block.uncertaintyReason}/></div>}</div>):<p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{page.plainText||'No visible content recognized.'}</p>}</div>
          {page.warnings?.map((warning,index)=><p key={index} className="mt-2 text-xs text-amber-600 dark:text-amber-300">{warning}</p>)}
        </article>)}</div>
        {result.warnings?.length>0&&<Alert type="warning" className="mt-4 mb-0">{result.warnings.join(' ')}</Alert>}
      </div>}
    </Card>
  </section>;
}
