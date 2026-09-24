import openCvModule from '@techstark/opencv-js';

const RUNTIME_TIMEOUT_MS = 20_000;

export async function resolveOpenCvRuntime() {
  let cv = openCvModule;
  if (typeof cv?.then === 'function') cv = await cv;
  if (cv?.Mat) return cv;

  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('OpenCV initialization timed out.')),
      RUNTIME_TIMEOUT_MS,
    );
    const previousHandler = cv?.onRuntimeInitialized;

    cv.onRuntimeInitialized = () => {
      window.clearTimeout(timeout);
      previousHandler?.();
      resolve();
    };
  });

  return cv;
}
