import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronRight, Pencil, RotateCcw, X } from 'lucide-react';
import { Alert, Btn, ConfirmModal, Input, Select, Spinner, Textarea } from '../ui';
import ProtectedCaptureImage from '../hardware/ProtectedCaptureImage';
import WorkspaceToast from './WorkspaceToast';
import ImageLightbox from '../recognition/ImageLightbox';
import GeneratedContent from './GeneratedContent';
import { getQuizSolutions, recognizeQuizSolution, analyzeQuizSolution, gradeQuizSolution } from '../../services/phase6Api';

function ReviewDisclosure({ label, children, defaultOpen = false }) {
  const [open,setOpen]=useState(defaultOpen);
  const contentId=useId();
  return <section className="quiz-review-disclosure-section">
    <button type="button" className="quiz-review-disclosure" aria-expanded={open} aria-controls={contentId} onClick={()=>setOpen(value=>!value)}>
      <ChevronRight size={17} aria-hidden="true" className={open?'is-open':''}/><span>{label}</span>
    </button>
    {open&&<div id={contentId} className="quiz-review-disclosure-content">{children}</div>}
  </section>;
}

function gradeDraftMatchesSuggestion(row, score, feedback) {
  const suggestedScore=Number(row.aiReview?.suggested_score);
  const suggestedMax=Number(row.aiReview?.max_score??row.maxPoints);
  return score!==''&&Number.isFinite(suggestedScore)&&suggestedScore>=0&&suggestedScore<=Number(row.maxPoints)
    &&suggestedMax===Number(row.maxPoints)&&Number(score)===suggestedScore
    &&String(feedback||'')===String(row.aiReview?.suggested_feedback||'');
}

export function AnswerReview({ row, onUpdate, refresh, onGrade }) {
  const initialScore=row.pointsAwarded==null?'':String(row.pointsAwarded);
  const initialFeedback=row.instructorFeedback||'';
  const [score,setScore]=useState(initialScore),[feedback,setFeedback]=useState(initialFeedback);
  const [savedGrade,setSavedGrade]=useState({score:initialScore,feedback:initialFeedback});
  const [recognitionStatus,setRecognitionStatus]=useState(row.recognitionStatus==='READY'?'complete':row.recognitionStatus==='PROCESSING'?'processing':row.recognitionStatus==='FAILED'?'error':'idle');
  const [analysisStatus,setAnalysisStatus]=useState(row.aiReview?'complete':'idle');
  const [reprocessStatus,setReprocessStatus]=useState('idle');
  const [gradeSaveStatus,setGradeSaveStatus]=useState(row.gradedAt?'saved':'idle');
  const [isEditingGrade,setIsEditingGrade]=useState(!row.gradedAt);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [confirmSuggestion,setConfirmSuggestion]=useState(false),[confirmReprocess,setConfirmReprocess]=useState(false);
  const [suggestionApplyStatus,setSuggestionApplyStatus]=useState(()=>gradeDraftMatchesSuggestion(row,initialScore,initialFeedback)?'applied':'idle');
  const pending = useRef(false);
  const [toast,setToast]=useState(null),[viewImage,setViewImage]=useState(false);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),3000);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{
    const nextScore=row.pointsAwarded==null?'':String(row.pointsAwarded),nextFeedback=row.instructorFeedback||'';
    setSavedGrade({score:nextScore,feedback:nextFeedback});
    setScore(nextScore);setFeedback(nextFeedback);
    setGradeSaveStatus(row.gradedAt?'saved':'idle');setIsEditingGrade(!row.gradedAt);
    setSuggestionApplyStatus(gradeDraftMatchesSuggestion(row,nextScore,nextFeedback)?'applied':'idle');
  },[row.id,row.pointsAwarded,row.instructorFeedback,row.gradedAt]);
  useEffect(()=>setRecognitionStatus(row.recognitionStatus==='READY'?'complete':row.recognitionStatus==='PROCESSING'?'processing':row.recognitionStatus==='FAILED'?'error':'idle'),[row.id,row.recognitionStatus]);
  useEffect(()=>setAnalysisStatus(row.aiReview?'complete':'idle'),[row.id,row.aiReview]);
  useEffect(()=>setReprocessStatus('idle'),[row.id]);

  const normalizedScore=score===''?'':String(Number(score));
  const normalizedSavedScore=savedGrade.score===''?'':String(Number(savedGrade.score));
  const isGradeDirty=normalizedScore!==normalizedSavedScore||feedback!==savedGrade.feedback;
  const scoreNumber=Number(score);
  const validScoreText=/^\d+(?:\.\d{1,2})?$/.test(String(score).trim());
  const scoreValid=score!==''&&validScoreText&&Number.isFinite(scoreNumber)&&scoreNumber>=0&&scoreNumber<=Number(row.maxPoints);
  const suggestedScore=Number(row.aiReview?.suggested_score);
  const suggestedMax=Number(row.aiReview?.max_score??row.maxPoints);
  const suggestionValid=Number.isFinite(suggestedScore)&&suggestedScore>=0&&suggestedScore<=Number(row.maxPoints)&&suggestedMax===Number(row.maxPoints);

  async function runReview(action, request) {
    if (pending.current) return;
    pending.current=true;setBusy(action);setError('');
    if(action==='recognize')setRecognitionStatus('processing');
    else if(action==='reprocess')setReprocessStatus('processing');
    else setAnalysisStatus('processing');
    try{
      const updated=await request();onUpdate(updated);
      if(action==='recognize')setRecognitionStatus('complete');
      else {setAnalysisStatus('complete');setReprocessStatus('idle');setSuggestionApplyStatus(gradeDraftMatchesSuggestion(updated,score,feedback)?'applied':'idle');}
      if(action==='reprocess')setToast({id:Date.now(),text:'AI analysis refreshed'});
    }catch(requestError){
      if(action==='recognize')setRecognitionStatus('error');
      else if(action==='reprocess')setReprocessStatus('error');
      else setAnalysisStatus('error');
      setError(requestError.response?.data?.error||'Unable to complete this action. Try again.');
      await refresh();
    }finally{pending.current=false;setBusy('');}
  }

  function reprocessAnalysis() {
    setConfirmReprocess(false);
    return runReview('reprocess',()=>analyzeQuizSolution(row.id));
  }

  function applySuggestion() {
    if(!suggestionValid)return;
    setScore(String(suggestedScore));
    setFeedback(row.aiReview?.suggested_feedback||'');
    setIsEditingGrade(true);setGradeSaveStatus('idle');setSuggestionApplyStatus('applied');setConfirmSuggestion(false);setError('');
  }

  function chooseSuggestion() {
    if(isGradeDirty)setConfirmSuggestion(true);else applySuggestion();
  }

  function cancelGradeEdit() {
    setScore(savedGrade.score);
    setFeedback(savedGrade.feedback);
    setIsEditingGrade(false);
    setGradeSaveStatus('saved');
    setSuggestionApplyStatus(gradeDraftMatchesSuggestion(row,savedGrade.score,savedGrade.feedback)?'applied':'idle');
    setConfirmSuggestion(false);
    setError('');
  }

  async function saveGrade() {
    if(pending.current||!scoreValid||!isGradeDirty)return;
    pending.current=true;setBusy('grade');setGradeSaveStatus('saving');setError('');
    try{
      const updated=await gradeQuizSolution(row.id,{pointsAwarded:scoreNumber,instructorFeedback:feedback});
      onUpdate(updated);
      const nextScore=updated.pointsAwarded==null?'':String(updated.pointsAwarded),nextFeedback=updated.instructorFeedback||'';
      setScore(nextScore);setFeedback(nextFeedback);setSavedGrade({score:nextScore,feedback:nextFeedback});
      setGradeSaveStatus('saved');setIsEditingGrade(false);
      setSuggestionApplyStatus(gradeDraftMatchesSuggestion(updated,nextScore,nextFeedback)?'applied':'idle');
      setToast({id:Date.now(),text:'Grade saved'});await onGrade?.();
    }catch(requestError){
      setGradeSaveStatus('error');
      setError(requestError.response?.data?.error||'Unable to save this grade. Try again.');
    }finally{pending.current=false;setBusy('');}
  }
  return <div className="min-w-0 mt-4 space-y-4">
    <WorkspaceToast notification={toast} onDismiss={()=>setToast(null)}/>
    <ImageLightbox open={viewImage} onClose={()=>setViewImage(false)} title="Handwritten solution" protectedUrl={row.solution?.imageUrl} alt="Student handwritten solution"/>
    {error && <Alert type="error">{error}</Alert>}
    <GeneratedContent markdown={row.prompt} className="quiz-review-math" reviewIndicator/>
    {row.problemSettings?.rubric && <ReviewDisclosure label="Instructor-only rubric"><GeneratedContent markdown={row.problemSettings.rubric} className="quiz-review-math" reviewIndicator/></ReviewDisclosure>}
    {!row.solution && <GeneratedContent markdown={row.answer || 'No written answer provided.'} className="quiz-review-math" reviewIndicator/>}
    {row.solution && <>
      <section className="quiz-ai-analysis-controls" aria-labelledby={`ai-analysis-${row.id}`}>
        <div><p className="quiz-ai-grading-label">AI analysis</p><h4 id={`ai-analysis-${row.id}`}>Recognition and advisory review</h4></div>
        <p>AI analysis is advisory. The instructor's official score and feedback remain authoritative.</p>
        {row.recognitionFailure && <p className="quiz-review-process-error" role="alert">{row.recognitionFailure}</p>}
        <div className="quiz-review-actions">
          <div className="quiz-review-status-control">
            <Btn size="sm" variant={recognitionStatus==='complete'?'success':'secondary'} disabled={Boolean(busy)||Boolean(row.gradedAt)||['complete','processing'].includes(recognitionStatus)} aria-busy={recognitionStatus==='processing'||undefined} onClick={()=>runReview('recognize',()=>recognizeQuizSolution(row.id))}>
              {recognitionStatus==='processing'?<><Spinner/>Recognizing...</>:recognitionStatus==='complete'?<><Check size={16}/>Recognized!</>:recognitionStatus==='error'?'Retry Recognition':'Recognize Solution'}
            </Btn>
            <small>{recognitionStatus==='complete'?'Image processing completed':'Process the submitted image'}</small>
          </div>
          <div className="quiz-review-status-control">
            <Btn size="sm" variant={analysisStatus==='complete'?'success':'secondary'} disabled={Boolean(busy)||row.recognitionStatus!=='READY'||['complete','processing'].includes(analysisStatus)} aria-busy={analysisStatus==='processing'||undefined} onClick={()=>runReview('analyze',()=>analyzeQuizSolution(row.id))}>
              {analysisStatus==='processing'?<><Spinner/>Analyzing...</>:analysisStatus==='complete'?<><Check size={16}/>Done Analyze!</>:analysisStatus==='error'?'Retry AI Analysis':'Analyze with AI'}
            </Btn>
            <small>{analysisStatus==='complete'?'Advisory analysis completed':'Generate an instructor-only advisory'}</small>
          </div>
          {analysisStatus==='complete' && <div className="quiz-review-status-control">
            <Btn size="sm" variant="secondary" disabled={Boolean(busy)} aria-busy={reprocessStatus==='processing'||undefined} onClick={()=>setConfirmReprocess(true)}>
              {reprocessStatus==='processing'?<><Spinner/>Reprocessing AI analysis...</>:<><RotateCcw size={16}/>Reprocess AI Analyzation?</>}
            </Btn>
            <small>Refresh only the AI suggestion</small>
          </div>}
        </div>
      </section>

      <div className={`quiz-review-evidence-grid ${row.aiReview?'':'is-single'}`}>
        {row.aiReview && <section className="quiz-ai-evaluation">
          <p className="quiz-ai-grading-label">Instructor advisory</p>
          <h4>AI Evaluation</h4>
          <p className="quiz-ai-assessment">{row.aiReview.assessment?.replaceAll('_',' ')}</p>
          <section><h5>Analysis</h5><GeneratedContent markdown={row.aiReview.summary} className="quiz-review-math" reviewIndicator/></section>
          {row.aiReview.strengths?.length>0 && <section><h5>What the solution shows</h5>{row.aiReview.strengths.map((item,index)=><GeneratedContent key={index} markdown={item} className="quiz-review-math" reviewIndicator/>)}</section>}
          {row.aiReview.possible_errors?.length>0 && <section><h5>Points to verify</h5>{row.aiReview.possible_errors.map((item,index)=><GeneratedContent key={index} markdown={[item.step,item.issue,item.suggestion].filter(Boolean).join('\n\n')} className="quiz-review-math" reviewIndicator/>)}</section>}
        </section>}
        <section className="quiz-student-submitted-work">
          <p className="quiz-ai-grading-label">Student submitted work</p>
          <h4>Handwritten solution</h4>
          <button type="button" className="quiz-submission-image-button" aria-label="View handwritten solution full size" onClick={()=>setViewImage(true)}>
            <ProtectedCaptureImage url={row.solution.imageUrl} alt="Student handwritten solution" className="object-contain w-full max-h-96"/>
            <span>View Full Size</span>
          </button>
          <small>The original image remains available if recognition fails.</small>
        </section>
      </div>

      {row.aiReview && <div className="quiz-ai-grading-review">
        <p className="quiz-ai-grading-label">AI suggested grade and feedback</p>
        <h4>Review the suggestion before applying it</h4>
        <div className="quiz-ai-suggestion-grid">
          <div className="quiz-ai-suggestion-score"><span>Suggested Score</span><strong>{suggestionValid?suggestedScore:'—'} <small>/ {row.maxPoints}</small></strong></div>
          <div className="quiz-ai-suggested-feedback"><span>Suggested Feedback</span><GeneratedContent markdown={row.aiReview.suggested_feedback||'No specific feedback suggested.'} className="quiz-review-math" reviewIndicator mathFallback/></div>
        </div>
        <div className="quiz-ai-approval">
          <p>Use this suggested feedback and score?</p>
          {suggestionApplyStatus==='idle'&&<div><Btn size="sm" disabled={!suggestionValid||Boolean(busy)} onClick={chooseSuggestion}><Check size={16}/>Yes, Use This</Btn></div>}
          {suggestionApplyStatus==='applied'&&<div><Btn size="sm" variant="success" disabled><Check size={16}/>Applied!</Btn></div>}
          {suggestionApplyStatus==='applied'&&<small role="status"><Check size={14}/>Suggestion applied. Review it, then save the official grade.</small>}
          {suggestionApplyStatus==='edited'&&<small role="status">AI suggestion was applied; instructor edits are pending.</small>}
        </div>
      </div>}
    </>}
    <div className="quiz-official-grade">
      <div><p className="quiz-ai-grading-label">Official grade</p><h4>Instructor decision</h4></div>
      {isEditingGrade?<>
        <label className="grid gap-2 text-sm font-semibold max-w-48">
          <span>Official score <span className="font-normal text-muted-foreground">/ {row.maxPoints}</span></span>
          <Input className="block official-score-input" type="number" min="0" max={row.maxPoints} step="0.01" value={score} disabled={Boolean(busy)} aria-invalid={score!==''&&!scoreValid||undefined} onChange={event=>{setScore(event.target.value);setGradeSaveStatus('idle');setSuggestionApplyStatus(current=>current==='applied'||current==='edited'?'edited':'idle');}}/>
        </label>
        {score!==''&&!scoreValid&&<p className="text-sm text-destructive" role="alert">Enter a score from 0 to {row.maxPoints}, using at most two decimal places.</p>}
        <label className="block text-sm font-semibold">Feedback to student<Textarea className="mt-2" value={feedback} disabled={Boolean(busy)} onChange={event=>{setFeedback(event.target.value);setGradeSaveStatus('idle');setSuggestionApplyStatus(current=>current==='applied'||current==='edited'?'edited':'idle');}}/></label>
      </>:<div className="quiz-official-grade-readonly">
        <div className="quiz-official-score-readonly"><span>Official score</span><strong>{savedGrade.score} <small>/ {row.maxPoints}</small></strong></div>
        <div className="quiz-official-feedback-readonly"><span>Feedback to student</span><GeneratedContent markdown={savedGrade.feedback||'No feedback provided.'} className="quiz-review-math quiz-official-feedback" reviewIndicator mathFallback/></div>
      </div>}
      <div className="quiz-grade-save-actions">
        {gradeSaveStatus==='saved'&&!isEditingGrade?<><Btn size="sm" variant="success" disabled><Check size={16}/>Saved!</Btn><Btn size="sm" variant="secondary" onClick={()=>{setIsEditingGrade(true);setGradeSaveStatus('idle');}}><Pencil size={15}/>Edit Grade</Btn></>:<><Btn size="sm" disabled={Boolean(busy)||!scoreValid||!isGradeDirty} aria-busy={gradeSaveStatus==='saving'||undefined} onClick={saveGrade}>{gradeSaveStatus==='saving'?<><Spinner/>Saving...</>:row.gradedAt?'Save Changes':'Save Official Grade'}</Btn>{row.gradedAt&&<Btn size="sm" variant="secondary" disabled={Boolean(busy)} onClick={cancelGradeEdit}><X size={15}/>Cancel Edit</Btn>}</>}
      </div>
      <p className="text-xs text-slate-500">{row.gradedAt ? 'Official grade saved.' : 'Awaiting professor review.'} The final quiz result is released when every manual question is graded.</p>
    </div>
    {confirmSuggestion&&<ConfirmModal title="Apply AI suggestion?" body="This will replace your current score and feedback fields. You can still review and edit them before saving." confirmLabel="Apply Suggestion" onConfirm={applySuggestion} onCancel={()=>setConfirmSuggestion(false)}/>}
    {confirmReprocess&&<ConfirmModal title="Reprocess AI analysis?" body="This will replace the current AI suggestion, but will not change the official instructor grade or feedback." confirmLabel="Reprocess" onConfirm={reprocessAnalysis} onCancel={()=>setConfirmReprocess(false)}/>}
  </div>;
}

export default function QuizSolutionReview({ quizId }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]), [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  async function refresh() {
    try { const result = await getQuizSolutions(quizId); setRows(result); setSelected(current => result.some(row => row.id === current) ? current : result[0]?.id || ''); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Unable to load submitted answers.'); }
  }
  useEffect(() => {
    if (!open) return;
    let active = true; setLoading(true); setError('');
    getQuizSolutions(quizId).then(result => { if (active) { setRows(result); setSelected(result[0]?.id || ''); } })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Unable to load submitted answers.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, quizId]);
  const row = rows.find(item => item.id === selected);
  return <section className="min-w-0 p-4 mb-5 border rounded-lg border-slate-200 dark:border-slate-700">
    <button type="button" className="quiz-review-disclosure" aria-expanded={open} onClick={() => setOpen(value => !value)}><ChevronRight size={17} aria-hidden="true" className={open?'is-open':''}/><span>{open?'Hide submitted answers':'Review submitted answers'}</span></button>
    {open && <>{error && <Alert>{error}</Alert>}{loading ? <p className="mt-3 text-sm">Loading submissions…</p> : rows.length ? <>
      <Select className="mt-3" aria-label="Submitted answer" value={selected} onChange={event => setSelected(event.target.value)}>{rows.map(item => <option key={item.id} value={item.id}>{item.student.name} · Question {item.order} · {item.gradedAt ? 'Graded' : 'Awaiting review'}</option>)}</Select>
      {row && <AnswerReview key={row.id} row={row} refresh={refresh} onUpdate={updated => setRows(current => current.map(item => item.id === updated.id ? updated : item))}/>}
    </> : <p className="mt-3 text-sm text-slate-500">No submitted answers requiring manual review yet.</p>}</>}
  </section>;
}
