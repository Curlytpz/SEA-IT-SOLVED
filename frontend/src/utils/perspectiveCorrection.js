import { advancedCells, calibrationPlanes, outerCornersFromAdvanced } from './calibrationPlanes';

let openCvPromise;

export async function loadOpenCv() {
  if (!openCvPromise) {
    openCvPromise = import('@techstark/opencv-js')
      .then(async module => {
        let cv = module.default || module;
        if (typeof cv?.then === 'function') cv = await cv;
        if (cv?.Mat) return cv;
        await new Promise(resolve => { cv.onRuntimeInitialized = resolve; });
        return cv;
      })
      .catch(error => {
        openCvPromise = undefined;
        throw error;
      });
  }
  return openCvPromise;
}

function distance(a, b, width, height) {
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}

export function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to encode corrected image.')), 'image/jpeg', .94));
}

export async function correctPerspective(sourceCanvas, points, tracePoints = []) {
  const cv = await loadOpenCv();
  const width = sourceCanvas.width, height = sourceCanvas.height;
  const outputWidth = Math.max(1, Math.round(Math.max(distance(points.topLeft, points.topRight, width, height), distance(points.bottomLeft, points.bottomRight, width, height))));
  const outputHeight = Math.max(1, Math.round(Math.max(distance(points.topLeft, points.bottomLeft, width, height), distance(points.topRight, points.bottomRight, width, height))));
  const trace = tracePoints.length >= 3 ? tracePoints : [points.topLeft, points.topRight, points.bottomRight, points.bottomLeft];
  let src, sourceMask, warped, warpedMask, maskedWarped, sourcePoints, destinationPoints, polygon, contours, matrix, roi, cropped;
  try {
    src = cv.imread(sourceCanvas);
    sourceMask = cv.Mat.zeros(height, width, cv.CV_8UC1);
    polygon = cv.matFromArray(trace.length, 1, cv.CV_32SC2, trace.flatMap(point => [
      Math.round(clampCoordinate(point.x) * (width - 1)),
      Math.round(clampCoordinate(point.y) * (height - 1)),
    ]));
    contours = new cv.MatVector();
    contours.push_back(polygon);
    cv.fillPoly(sourceMask, contours, new cv.Scalar(255));

    sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      points.topLeft.x * width, points.topLeft.y * height,
      points.topRight.x * width, points.topRight.y * height,
      points.bottomRight.x * width, points.bottomRight.y * height,
      points.bottomLeft.x * width, points.bottomLeft.y * height,
    ]);
    destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, outputWidth - 1, 0, outputWidth - 1, outputHeight - 1, 0, outputHeight - 1,
    ]);
    matrix = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
    warped = new cv.Mat();
    warpedMask = new cv.Mat();
    cv.warpPerspective(src, warped, matrix, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    cv.warpPerspective(sourceMask, warpedMask, matrix, new cv.Size(outputWidth, outputHeight), cv.INTER_NEAREST, cv.BORDER_CONSTANT, new cv.Scalar(0));

    maskedWarped = new cv.Mat(outputHeight, outputWidth, warped.type(), new cv.Scalar(255, 255, 255, 255));
    warped.copyTo(maskedWarped, warpedMask);

    const bounds = cv.boundingRect(warpedMask);
    if (!bounds.width || !bounds.height) throw new Error('The traced calibration region is empty after perspective correction.');
    roi = maskedWarped.roi(bounds);
    cropped = roi.clone();

    const canvas = document.createElement('canvas');
    cv.imshow(canvas, cropped);
    return { canvas, blob: await canvasBlob(canvas), width: bounds.width, height: bounds.height };
  } finally {
    cropped?.delete(); roi?.delete(); matrix?.delete(); contours?.delete(); polygon?.delete();
    destinationPoints?.delete(); sourcePoints?.delete(); maskedWarped?.delete(); warpedMask?.delete(); warped?.delete();
    sourceMask?.delete(); src?.delete();
  }
}

function clampCoordinate(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export async function correctAdvancedPerspective(sourceCanvas, points) {
  const cv = await loadOpenCv();
  const width = sourceCanvas.width, height = sourceCanvas.height;
  const outer = outerCornersFromAdvanced(points);
  const outputWidth = Math.max(2, Math.round(Math.max(
    distance(outer.topLeft, outer.topRight, width, height),
    distance(outer.bottomLeft, outer.bottomRight, width, height)
  )));
  const outputHeight = Math.max(2, Math.round(Math.max(
    distance(outer.topLeft, outer.bottomLeft, width, height),
    distance(outer.topRight, outer.bottomRight, width, height)
  )));
  const halfWidth = Math.round(outputWidth / 2), halfHeight = Math.round(outputHeight / 2);
  const destinations = [
    [0, 0, halfWidth, halfHeight],
    [halfWidth, 0, outputWidth, halfHeight],
    [0, halfHeight, halfWidth, outputHeight],
    [halfWidth, halfHeight, outputWidth, outputHeight],
  ];
  let source, destination;
  const allocations = [];
  try {
    source = cv.imread(sourceCanvas);
    destination = cv.Mat.zeros(outputHeight, outputWidth, source.type());
    const cells = advancedCells(points);
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index], [left, top, right, bottom] = destinations[index];
      const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        cell.topLeft.x * width, cell.topLeft.y * height,
        cell.topRight.x * width, cell.topRight.y * height,
        cell.bottomRight.x * width, cell.bottomRight.y * height,
        cell.bottomLeft.x * width, cell.bottomLeft.y * height,
      ]);
      const destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
        left, top, right - 1, top, right - 1, bottom - 1, left, bottom - 1,
      ]);
      const matrix = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
      const warped = new cv.Mat();
      cv.warpPerspective(source, warped, matrix, new cv.Size(outputWidth, outputHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
      const rectangle = new cv.Rect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
      const sourceRegion = warped.roi(rectangle), destinationRegion = destination.roi(rectangle);
      sourceRegion.copyTo(destinationRegion);
      sourceRegion.delete(); destinationRegion.delete(); warped.delete(); matrix.delete(); destinationPoints.delete(); sourcePoints.delete();
    }
    const canvas = document.createElement('canvas');
    cv.imshow(canvas, destination);
    return { canvas, blob: await canvasBlob(canvas), width: outputWidth, height: outputHeight };
  } finally {
    allocations.forEach(value => value?.delete?.());
    destination?.delete(); source?.delete();
  }
}

export async function correctCalibration(sourceCanvas, calibration) {
  const plane = calibrationPlanes(calibration)[0];
  if (!plane) throw new Error('A valid calibration region is required.');
  return correctPerspectivePlanes(sourceCanvas, [plane]);
}

export async function correctPerspectivePlanes(sourceCanvas, planes) {
  const results = [];
  for (const plane of [...planes].sort((a, b) => a.order - b.order)) {
    const corrected = await correctPerspective(sourceCanvas, plane.perspectiveAnchors || plane.corners, plane.points || plane.tracePoints || []);
    results.push({ ...corrected, planeId: plane.id, label: plane.label, order: plane.order, corners: plane.corners });
  }
  return results;
}

function orderedQuad(points) {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const start = sorted.reduce((best, point, index) => point.x + point.y < sorted[best].x + sorted[best].y ? index : best, 0);
  const rotated = [...sorted.slice(start), ...sorted.slice(0, start)];
  return rotated[1].x > rotated[3].x ? rotated : [rotated[0], rotated[3], rotated[2], rotated[1]];
}

export async function detectBoardBoundary(sourceCanvas) {
  const cv = await loadOpenCv();
  const width = sourceCanvas.width, height = sourceCanvas.height;
  let source, gray, blurred, edges, contours, hierarchy;
  const allocated = [];
  try {
    source = cv.imread(sourceCanvas);
    gray = new cv.Mat(); blurred = new cv.Mat(); edges = new cv.Mat();
    contours = new cv.MatVector(); hierarchy = new cv.Mat();
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 45, 140);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let best = null;
    const frameArea = width * height;
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const area = Math.abs(cv.contourArea(contour));
      if (area < frameArea * 0.08) { contour.delete(); continue; }
      const perimeter = cv.arcLength(contour, true);
      const approximation = new cv.Mat();
      cv.approxPolyDP(contour, approximation, perimeter * 0.025, true);
      if (approximation.rows === 4 && cv.isContourConvex(approximation)) {
        const bounds = cv.boundingRect(approximation);
        const aspect = bounds.width / Math.max(1, bounds.height);
        const rectangularity = area / Math.max(1, bounds.width * bounds.height);
        if (aspect >= 0.65 && aspect <= 6 && rectangularity >= 0.55) {
          const score = area * rectangularity;
          if (!best || score > best.score) {
            const quad = [];
            for (let row = 0; row < 4; row += 1) {
              const values = approximation.intPtr(row, 0);
              quad.push({ x: values[0], y: values[1] });
            }
            best = { score, quad };
          }
        }
      }
      approximation.delete(); contour.delete();
    }
    if (!best) return null;
    const [topLeft, topRight, bottomRight, bottomLeft] = orderedQuad(best.quad);
    const normalize = point => ({ x: clampCoordinate(point.x / Math.max(1, width - 1)), y: clampCoordinate(point.y / Math.max(1, height - 1)) });
    const corners = {
      topLeft: normalize(topLeft), topRight: normalize(topRight),
      bottomRight: normalize(bottomRight), bottomLeft: normalize(bottomLeft),
    };
    return { corners, points: [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft] };
  } finally {
    allocated.forEach(value => value?.delete?.());
    hierarchy?.delete(); contours?.delete(); edges?.delete(); blurred?.delete(); gray?.delete(); source?.delete();
  }
}

export async function combineCorrectedPlanes(results) {
  if (!results.length) throw new Error('At least one corrected plane is required.');
  if (results.length === 1) return results[0];
  const gap = 8;
  const targetHeight = Math.min(1200, Math.max(...results.map(result => result.height)));
  const widths = results.map(result => Math.max(1, Math.round(result.width * targetHeight / result.height)));
  const canvas = document.createElement('canvas');
  canvas.width = widths.reduce((sum, width) => sum + width, 0) + gap * (results.length - 1);
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let x = 0;
  results.forEach((result, index) => {
    context.drawImage(result.canvas, x, 0, widths[index], targetHeight);
    x += widths[index];
    if (index < results.length - 1) {
      context.fillStyle = '#0f172a';
      context.fillRect(x, 0, gap, targetHeight);
      x += gap;
    }
  });
  return { canvas, blob: await canvasBlob(canvas), width: canvas.width, height: canvas.height };
}







