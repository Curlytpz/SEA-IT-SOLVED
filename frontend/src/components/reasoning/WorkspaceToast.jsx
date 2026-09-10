import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { StatusNotice } from '../ui';

// The workspace's existing single toast slot, portaled out of PageTransition's transform.
export default function WorkspaceToast({ notification, onDismiss, onReview }) {
  const reduced = useReducedMotion();
  const error = notification?.type === 'error';
  return createPortal(
    <div className="pointer-events-none fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-[70] sm:inset-x-auto sm:right-5 sm:top-auto sm:bottom-[calc(10rem+env(safe-area-inset-bottom))] sm:w-[390px]">
      <AnimatePresence initial={false} mode="wait">
        {notification && <motion.div key={notification.id} aria-atomic="true"
          initial={{ opacity: 0, y: reduced ? 0 : 6, scale: reduced ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduced ? 0 : 4 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: 'easeOut' }}
          className="pointer-events-auto">
          <StatusNotice
            type={error ? 'error' : 'success'}
            label={error ? 'Workspace error' : 'Workspace update'}
            title={notification.text || 'Quiz draft generated successfully.'}
            actions={notification.quizId && <button type="button" className="min-h-9 text-xs font-semibold text-primary-subtle-foreground underline underline-offset-4" onClick={() => onReview(notification.quizId)}>Review Quiz</button>}
            onClose={onDismiss}
            className="mb-0 shadow-lg"
            animated={false}
          >{notification.description}</StatusNotice>
        </motion.div>}
      </AnimatePresence>
    </div>, document.body);
}
