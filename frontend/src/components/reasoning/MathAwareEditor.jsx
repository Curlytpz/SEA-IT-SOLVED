import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { RotateCcw, Sigma, X } from 'lucide-react';
import { Btn } from '../ui';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { normalizeMathEditorContent, serializeMathEditorSegments, splitMathEditorContent } from '../../utils/mathEditorContent';
import { withSafeInlineMathStyle } from '../../utils/mathRenderingContract';
import GeneratedContent from './GeneratedContent';
import './MathAwareEditor.live.css';

let mathliveLoader;
let mathliveReady = false;
let segmentSequence = 0;

function loadMathLive() {
  if (!mathliveLoader) {
    mathliveLoader = import('mathlive')
      .then(module => {
        mathliveReady = true;
        return module;
      })
      .catch(error => {
        mathliveLoader = null;
        mathliveReady = false;
        throw error;
      });
  }
  return mathliveLoader;
}

const PALETTES = {
  Basic: [
    ['+', '+', 'Plus'], ['−', '-', 'Minus'], ['×', '\\times', 'Multiply'], ['÷', '\\div', 'Divide'],
    ['=', '=', 'Equals'], ['≠', '\\ne', 'Not equal'], ['≤', '\\le', 'Less than or equal'], ['≥', '\\ge', 'Greater than or equal'],
    ['( )', '\\left(\\right)', 'Parentheses'], ['x²', '^{2}', 'Power'], ['a⁄b', '\\frac{}{}', 'Fraction'], ['√', '\\sqrt{}', 'Square root'], ['|x|', '\\left|\\right|', 'Absolute value'],
  ],
  Algebra: [
    ['x', 'x', 'x'], ['y', 'y', 'y'], ['n', 'n', 'n'], ['xⁿ', '^{}', 'Exponent'], ['xₙ', '_{}', 'Subscript'],
    ['a⁄b', '\\frac{}{}', 'Fraction'], ['ⁿ√', '\\sqrt[]{}', 'Nth root'],
  ],
  Calculus: [
    ['∫', '\\int', 'Integral'], ['∫ₐᵇ', '\\int_{}^{}', 'Definite integral'], ['d⁄dx', '\\frac{d}{dx}', 'Derivative'],
    ['∂', '\\partial', 'Partial derivative'], ['lim', '\\lim_{}', 'Limit'], ['Σ', '\\sum_{}^{}', 'Summation'], ['∞', '\\infty', 'Infinity'],
  ],
  Trigonometry: [
    ['sin', '\\sin', 'Sine'], ['cos', '\\cos', 'Cosine'], ['tan', '\\tan', 'Tangent'], ['sec', '\\sec', 'Secant'],
    ['csc', '\\csc', 'Cosecant'], ['cot', '\\cot', 'Cotangent'], ['θ', '\\theta', 'Theta'], ['π', '\\pi', 'Pi'],
  ],
  Statistics: [
    ['x̄', '\\bar{x}', 'Mean'], ['Σ', '\\sum', 'Sigma'], ['σ²', '\\sigma^2', 'Variance'], ['σ', '\\sigma', 'Standard deviation'],
    ['P( )', 'P\\left(\\right)', 'Probability'], ['H₀', 'H_0', 'Null hypothesis'], ['H₁', 'H_1', 'Alternative hypothesis'],
    ['z', 'z', 'Z score'], ['t', 't', 'T score'], ['nCr', '\\binom{n}{r}', 'Combination'],
  ],
  Physics: [
    ['v⃗', '\\vec{v}', 'Vector'], ['Δ', '\\Delta', 'Delta'], ['∇', '\\nabla', 'Nabla'], ['·', '\\cdot', 'Dot product'],
    ['×', '\\times', 'Cross product'], ['λ', '\\lambda', 'Lambda'], ['ω', '\\omega', 'Omega'],
  ],
  Greek: [
    ['α', '\\alpha', 'Alpha'], ['β', '\\beta', 'Beta'], ['γ', '\\gamma', 'Gamma'], ['δ', '\\delta', 'Delta lowercase'],
    ['θ', '\\theta', 'Theta'], ['λ', '\\lambda', 'Lambda'], ['μ', '\\mu', 'Mu'], ['π', '\\pi', 'Pi'],
    ['ρ', '\\rho', 'Rho'], ['σ', '\\sigma', 'Sigma'], ['φ', '\\phi', 'Phi'], ['ω', '\\omega', 'Omega'],
  ],
};

function createSegment(type, value, display = false, key) {
  segmentSequence += 1;
  return { type, value, display, key: key || `${type}-${segmentSequence}` };
}

function parseSegments(value) {
  return splitMathEditorContent(value).map(segment => createSegment(segment.type, segment.value, segment.display));
}

function serialize(segments) {
  return serializeMathEditorSegments(segments);
}

function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function renderLatex(element, latex, emptyLabel = 'New equation') {
  if (!element) return;
  element.replaceChildren();
  if (!latex) {
    element.textContent = emptyLabel;
    return;
  }
  const candidates = [latex, String(latex).replace(/\\\\/g, '\\')];
  for (const candidate of [...new Set(candidates)]) {
    try {
      katex.render(withSafeInlineMathStyle(candidate), element, { displayMode: false, throwOnError: true, strict: 'ignore' });
      return;
    } catch { }
  }
  try {
    katex.render(withSafeInlineMathStyle(candidates.at(-1)), element, { displayMode: false, throwOnError: false, strict: 'ignore' });
  } catch {
    element.textContent = 'Math needs attention';
  }
}

function EquationPreview({ latex, emptyLabel }) {
  const ref = useRef(null);
  useLayoutEffect(() => renderLatex(ref.current, latex, emptyLabel), [emptyLabel, latex]);
  return <span ref={ref} className="composition-equation-preview"/>;
}

function createEquationElement(segment, index, activeKey = '') {
  const element = document.createElement('span');
  element.className = `composition-equation${segment.key === activeKey ? ' is-active' : ''}`;
  element.contentEditable = 'false';
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', `Edit equation ${index + 1}`);
  element.setAttribute('title', 'Edit equation');
  element.dataset.mathKey = segment.key;
  element.dataset.latex = segment.value;
  element.dataset.display = String(Boolean(segment.display));
  renderLatex(element, segment.value);
  return element;
}

function renderComposition(root, segments, activeKey = '') {
  if (!root) return;
  const fragment = document.createDocumentFragment();
  let equationIndex = 0;
  segments.forEach(segment => {
    if (segment.type === 'math') {
      fragment.append(createEquationElement(segment, equationIndex, activeKey));
      equationIndex += 1;
    } else {
      fragment.append(document.createTextNode(segment.value));
    }
  });
  root.replaceChildren(fragment);
}

function appendText(segments, value) {
  if (!value) return;
  const previous = segments.at(-1);
  if (previous?.type === 'text') previous.value += value;
  else segments.push(createSegment('text', value));
}

function readComposition(root) {
  const segments = [];
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(segments, node.nodeValue || '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node;
    if (element.hasAttribute('data-math-key')) {
      segments.push(createSegment('math', element.dataset.latex || '', element.dataset.display === 'true', element.dataset.mathKey));
      return;
    }
    if (element.tagName === 'BR') {
      appendText(segments, '\n');
      return;
    }
    const block = element.tagName === 'DIV' || element.tagName === 'P';
    if (block && segments.length && segments.at(-1)?.value && !segments.at(-1).value.endsWith('\n')) appendText(segments, '\n');
    Array.from(element.childNodes).forEach(visit);
  }
  Array.from(root?.childNodes || []).forEach(visit);
  return segments.length ? segments : [createSegment('text', '')];
}

function rangeBelongsTo(root, range) {
  if (!root || !range) return false;
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  return container === root || root.contains(container);
}

function MathField({ value, label, onChange, onActivate, register }) {
  const ref = useRef(null);
  const attemptRef = useRef(0);
  const [status, setStatus] = useState(mathliveReady ? 'ready' : 'loading');
  const onChangeRef = useRef(onChange);
  const onActivateRef = useRef(onActivate);
  const registerRef = useRef(register);
  onChangeRef.current = onChange;
  onActivateRef.current = onActivate;
  registerRef.current = register;

  const initialize = useCallback(() => {
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    setStatus(mathliveReady ? 'ready' : 'loading');
    loadMathLive()
      .then(() => { if (attemptRef.current === attempt) setStatus('ready'); })
      .catch(() => { if (attemptRef.current === attempt) setStatus('error'); });
  }, []);

  useEffect(() => {
    initialize();
    return () => { attemptRef.current += 1; };
  }, [initialize]);

  useEffect(() => {
    const field = ref.current;
    if (status !== 'ready' || !field) return undefined;
    field.smartFence = true;
    field.virtualKeyboardMode = 'manual';
    const input = event => onChangeRef.current(event.target.value);
    const focus = () => onActivateRef.current(field);
    field.addEventListener('input', input);
    field.addEventListener('focusin', focus);
    registerRef.current(field);
    return () => {
      field.removeEventListener('input', input);
      field.removeEventListener('focusin', focus);
      registerRef.current(null, field);
    };
  }, [status]);

  useEffect(() => {
    const field = ref.current;
    if (status === 'ready' && field && field.value !== (value || '')) field.value = value || '';
  }, [status, value]);

  useEffect(() => {
    if (status === 'ready' && ref.current) ref.current.setAttribute('aria-label', label);
  }, [label, status]);

  if (status !== 'ready') return <div className={`math-editor-fallback ${status === 'error' ? 'has-error' : ''}`} aria-label={`${label}, equation`}>
    <EquationPreview latex={value}/>
    {status === 'loading'
      ? <span className="sr-only">Preparing the visual equation editor.</span>
      : <TooltipProvider><Tooltip>
          <TooltipTrigger render={<button type="button" className="math-editor-retry" aria-label="Retry equation editor" onClick={initialize}/> }>
            <RotateCcw size={15}/>
          </TooltipTrigger>
          <TooltipContent>Retry equation editor</TooltipContent>
        </Tooltip></TooltipProvider>}
  </div>;

  return <math-field ref={ref} class="visual-math-field" smart-fence virtual-keyboard-mode="manual"/>;
}

function VisualMathAuthoringField({ value, onChange, label, multiline, disabled }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [category, setCategory] = useState('Basic');
  const [activeMathValue, setActiveMathValue] = useState('');
  const segmentsRef = useRef(parseSegments(value));
  const composerRef = useRef(null);
  const savedRangeRef = useRef(null);
  const interactionModeRef = useRef('text');
  const activeMathKeyRef = useRef('');
  const panelFieldRef = useRef(null);
  const lastTriggerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const syncTimerRef = useRef(null);
  const pendingValueRef = useRef(null);
  const previewValue = useDebouncedValue(normalizeMathEditorContent(value));
  onChangeRef.current = onChange;

  function flushParentSync() {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    if (pendingValueRef.current === null) return;
    const pending = pendingValueRef.current;
    pendingValueRef.current = null;
    onChangeRef.current(pending);
  }

  function scheduleParentSync(segments) {
    pendingValueRef.current = serialize(segments);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(flushParentSync, 180);
  }

  function syncFromComposition() {
    if (!composerRef.current) return segmentsRef.current;
    const next = readComposition(composerRef.current);
    segmentsRef.current = next;
    scheduleParentSync(next);
    return next;
  }

  function rememberCursor() {
    const root = composerRef.current;
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!rangeBelongsTo(root, range)) return;
    savedRangeRef.current = range.cloneRange();
    const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
    if (!anchor?.closest?.('[data-math-key]')) {
      interactionModeRef.current = 'text';
      root.querySelectorAll('.composition-equation.is-active').forEach(element => element.classList.remove('is-active'));
    }
  }

  function handleCompositionInput() {
    syncFromComposition();
    rememberCursor();
  }

  function pastePlainText(event) {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!rangeBelongsTo(composerRef.current, range)) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    handleCompositionInput();
  }

  function openEditor(event) {
    if (disabled) return;
    lastTriggerRef.current = event.currentTarget;
    segmentsRef.current = parseSegments(value);
    savedRangeRef.current = null;
    interactionModeRef.current = 'text';
    activeMathKeyRef.current = '';
    setActiveMathValue('');
    setToolsOpen(false);
    setOpen(true);
    loadMathLive().catch(() => {});
  }

  function removeEmptyEquation() {
    const key = activeMathKeyRef.current;
    const element = key ? composerRef.current?.querySelector(`[data-math-key="${CSS.escape(key)}"]`) : null;
    if (element && !element.dataset.latex) element.remove();
  }

  function changeOpen(next) {
    if (!next) {
      removeEmptyEquation();
      syncFromComposition();
      flushParentSync();
    }
    setOpen(next);
    if (!next) {
      setToolsOpen(false);
      requestAnimationFrame(() => lastTriggerRef.current?.focus());
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      renderComposition(composerRef.current, segmentsRef.current);
      const root = composerRef.current;
      root?.focus();
      if (root) {
        const range = document.createRange();
        range.selectNodeContents(root);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        savedRangeRef.current = range.cloneRange();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
  }, []);

  function selectEquation(element) {
    if (!element) return;
    syncFromComposition();
    const root = composerRef.current;
    root?.querySelectorAll('.composition-equation.is-active').forEach(node => node.classList.remove('is-active'));
    element.classList.add('is-active');
    activeMathKeyRef.current = element.dataset.mathKey;
    interactionModeRef.current = 'math';
    setActiveMathValue(element.dataset.latex || '');
    setToolsOpen(true);
    loadMathLive().catch(() => {});
    requestAnimationFrame(() => panelFieldRef.current?.focus());
  }

  function handleCompositionClick(event) {
    const equation = event.target.closest?.('[data-math-key]');
    if (equation) selectEquation(equation);
    else rememberCursor();
  }

  function handleCompositionKey(event) {
    const equation = event.target.closest?.('[data-math-key]');
    if (equation && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selectEquation(equation);
      return;
    }
    if (!multiline && event.key === 'Enter') event.preventDefault();
  }

  function insertEquationAtCursor() {
    const root = composerRef.current;
    if (!root) return;
    const key = createSegment('math', '').key;
    const segment = createSegment('math', '', false, key);
    const element = createEquationElement(segment, root.querySelectorAll('[data-math-key]').length, key);
    let range = savedRangeRef.current?.cloneRange();
    if (!rangeBelongsTo(root, range)) {
      range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
    }
    range.deleteContents();
    range.insertNode(element);
    const selection = window.getSelection();
    range.setStartAfter(element);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();
    const next = readComposition(root);
    segmentsRef.current = next;
    scheduleParentSync(next);
    activeMathKeyRef.current = key;
    interactionModeRef.current = 'math';
    setActiveMathValue('');
    setToolsOpen(true);
    loadMathLive().catch(() => {});
  }

  function openMathPanel() {
    const active = activeMathKeyRef.current
      ? composerRef.current?.querySelector(`[data-math-key="${CSS.escape(activeMathKeyRef.current)}"]`)
      : null;
    if (interactionModeRef.current === 'math' && active) selectEquation(active);
    else insertEquationAtCursor();
  }

  function updateActiveMath(nextValue) {
    const key = activeMathKeyRef.current;
    const root = composerRef.current;
    const element = key ? root?.querySelector(`[data-math-key="${CSS.escape(key)}"]`) : null;
    if (!element) return;
    element.dataset.latex = nextValue;
    renderLatex(element, nextValue);
    element.classList.add('is-active');
    setActiveMathValue(nextValue);
    const next = readComposition(root);
    segmentsRef.current = next;
    scheduleParentSync(next);
  }

  function insertSymbol(latex) {
    const field = panelFieldRef.current;
    if (field?.executeCommand) {
      field.executeCommand(['insert', latex]);
      field.focus();
      requestAnimationFrame(() => updateActiveMath(field.value));
      return;
    }
    updateActiveMath(`${activeMathValue}${activeMathValue ? ' ' : ''}${latex}`);
  }

  function registerPanelField(field, removed) {
    if (removed && panelFieldRef.current === removed) panelFieldRef.current = null;
    if (field) {
      panelFieldRef.current = field;
      requestAnimationFrame(() => field.focus());
    }
  }

  function closeMathPanel() {
    removeEmptyEquation();
    syncFromComposition();
    setToolsOpen(false);
    interactionModeRef.current = 'text';
    activeMathKeyRef.current = '';
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function handleDisplayKey(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor(event);
    }
  }

  return <>
    <div className={`visual-math-authoring-field ${disabled ? 'is-disabled' : ''}`}>
      <div
        className="visual-math-rendered-value"
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? undefined : 0}
        aria-label={disabled ? label : `Edit ${label}`}
        aria-disabled={disabled || undefined}
        onClick={openEditor}
        onKeyDown={handleDisplayKey}
        onPointerEnter={() => loadMathLive().catch(() => {})}
        onFocus={() => loadMathLive().catch(() => {})}
      >
        {previewValue ? <GeneratedContent markdown={previewValue} quizText reviewIndicator={false}/> : <span className="visual-math-placeholder">Enter content</span>}
      </div>
      {!disabled && <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<button type="button" className="visual-math-edit-button" aria-label="Edit math" title="Edit math" onClick={openEditor} onPointerEnter={() => loadMathLive().catch(() => {})}/> }>
            <Sigma size={18}/>
          </TooltipTrigger>
          <TooltipContent>Edit math</TooltipContent>
        </Tooltip>
      </TooltipProvider>}
    </div>

    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="visual-math-dialog sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit {label}</DialogTitle>
          <DialogDescription>Edit the complete text below. Select an equation to edit it, or place the cursor and insert new math.</DialogDescription>
        </DialogHeader>

        <div
          ref={composerRef}
          role="textbox"
          tabIndex={0}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          aria-label={`${label} complete composition`}
          aria-multiline={multiline}
          className="whole-composition-editor"
          data-placeholder="Type the complete question"
          onInput={handleCompositionInput}
          onBlur={syncFromComposition}
          onPaste={pastePlainText}
          onClick={handleCompositionClick}
          onKeyDown={handleCompositionKey}
          onKeyUp={rememberCursor}
          onPointerUp={rememberCursor}
          onFocus={rememberCursor}
        />

        <div className="whole-composition-toolbar">
          <Button type="button" variant="outline" aria-expanded={toolsOpen} aria-controls={`${id}-math-panel`} onPointerDown={rememberCursor} onClick={openMathPanel}>
            <Sigma size={17}/>{toolsOpen ? 'Insert another equation' : 'Math symbols / Edit math'}
          </Button>
          <span>Select an equation above to edit it, or place the text cursor before inserting new math.</span>
        </div>

        {toolsOpen && <section id={`${id}-math-panel`} className="visual-math-lower-panel" aria-label="Math editing tools">
          <header className="visual-math-panel-heading">
            <div><strong>{activeMathValue ? 'Edit selected equation' : 'Create equation'}</strong><span>Changes appear in the complete question immediately.</span></div>
            <Button type="button" variant="ghost" size="sm" onClick={closeMathPanel}><X size={16}/>Done with math</Button>
          </header>
          <MathField
            value={activeMathValue}
            label={`${label}, selected equation`}
            onChange={updateActiveMath}
            onActivate={field => { panelFieldRef.current = field; }}
            register={registerPanelField}
          />
          <div className="math-symbol-keyboard visual-math-dialog-keyboard">
            <div role="tablist" aria-label="Math symbol categories" className="math-symbol-tabs">
              {Object.keys(PALETTES).map(name => <button key={name} type="button" role="tab" aria-selected={category === name} onClick={() => setCategory(name)}>{name}</button>)}
            </div>
            <div role="tabpanel" aria-label={`${category} symbols`} className="math-symbol-grid">
              {PALETTES[category].map(([symbol, latex, name]) => <button key={`${category}-${name}`} type="button" title={name} aria-label={`Insert ${name}`} onClick={() => insertSymbol(latex)}>{symbol}</button>)}
            </div>
          </div>
        </section>}

        <DialogFooter>
          <Button type="button" onClick={() => changeOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function LegacyMathEditor({ value = '', onChange, label, multiline = true, disabled = false, preview = true }) {
  const id = useId();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [category, setCategory] = useState('Basic');
  const activeField = useRef(null);
  const fields = useRef(new Set());
  const segments = useMemo(() => parseSegments(value), [value]);
  const previewValue = useDebouncedValue(value);

  const update = useCallback((index, nextValue) => {
    const next = segments.map((segment, segmentIndex) => segmentIndex === index ? { ...segment, value: nextValue } : segment);
    onChange(serialize(next));
  }, [onChange, segments]);
  const register = useCallback((field, removed) => {
    if (removed) fields.current.delete(removed);
    if (field) fields.current.add(field);
  }, []);
  const activate = useCallback(field => { activeField.current = field; }, []);
  const insert = useCallback(latex => {
    const target = activeField.current;
    if (target?.executeCommand) {
      target.executeCommand(['insert', latex]);
      target.focus();
      return;
    }
    const separator = value && !/\s$/.test(value) ? ' ' : '';
    onChange(`${value}${separator}$${latex}$`);
  }, [onChange, value]);

  return <div className={`math-aware-editor ${disabled ? 'is-disabled' : ''}`}>
    <div className="math-editor-segments" aria-label={`${label} visual editor`}>
      {segments.map((segment, index) => segment.type === 'math'
        ? <MathField key={segment.key} value={segment.value} label={`${label}, equation ${index + 1}`} onChange={next => update(index, next)} onActivate={activate} register={register}/>
        : multiline
          ? <textarea key={segment.key} id={index === 0 ? id : undefined} value={segment.value} disabled={disabled} onChange={event => update(index, event.target.value)} aria-label={`${label}, text`} rows={Math.max(2, Math.min(6, segment.value.split('\n').length + 1))}/>
          : <input key={segment.key} id={index === 0 ? id : undefined} value={segment.value} disabled={disabled} onChange={event => update(index, event.target.value)} aria-label={`${label}, text`}/>) }
    </div>
    {!disabled && <div className="math-editor-controls">
      <Btn size="sm" variant="secondary" aria-expanded={toolsOpen} aria-controls={`${id}-math-tools`} onClick={() => setToolsOpen(current => !current)}>{toolsOpen ? 'Hide math tools' : 'Insert or edit math'}</Btn>
      <span>Choose an equation to edit it, or insert a symbol at the end.</span>
    </div>}
    {!disabled && toolsOpen && <div id={`${id}-math-tools`} className="math-symbol-keyboard">
      <div role="tablist" aria-label="Math symbol categories" className="math-symbol-tabs">
        {Object.keys(PALETTES).map(name => <button key={name} type="button" role="tab" aria-selected={category === name} onClick={() => setCategory(name)}>{name}</button>)}
      </div>
      <div role="tabpanel" aria-label={`${category} symbols`} className="math-symbol-grid">
        {PALETTES[category].map(([symbol, latex, name]) => <button key={`${category}-${name}`} type="button" title={name} aria-label={`Insert ${name}`} onClick={() => insert(latex)}>{symbol}</button>)}
      </div>
    </div>}
    {preview && <div className="quiz-math-preview"><span>Student preview</span><GeneratedContent markdown={previewValue} quizText reviewIndicator={false}/></div>}
  </div>;
}

export default function MathAwareEditor({ unified = false, ...props }) {
  return unified ? <VisualMathAuthoringField {...props}/> : <LegacyMathEditor {...props}/>;
}
