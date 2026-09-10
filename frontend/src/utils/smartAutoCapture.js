export const DEFAULT_AUTO_CAPTURE_SETTINGS = {
  autoCaptureEnabled:true,
  autoCaptureMode:'SMART_AUTO',
  boardFillSensitivity:'MEDIUM',
  minimumContentChangePercent:20,
  stabilitySeconds:3,
  cooldownSeconds:30,
  intervalMinutes:5,
  captureWhilePaused:false,
};

const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const STABILITY_CHANGE_PERCENT = 1.5;
const THRESHOLDS = { LOW:170, MEDIUM:190, HIGH:210 };
const MINIMUM_COVERAGE = { LOW:3, MEDIUM:2, HIGH:1 };

export function analyzeBoardCanvas(sourceCanvas, sensitivity='MEDIUM') {
  const level = THRESHOLDS[sensitivity] ? sensitivity : 'MEDIUM';
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(sourceCanvas,0,0,SAMPLE_WIDTH,SAMPLE_HEIGHT);
  const pixels = context.getImageData(0,0,SAMPLE_WIDTH,SAMPLE_HEIGHT).data;
  const mask = new Uint8Array(SAMPLE_WIDTH*SAMPLE_HEIGHT);
  let contentPixels = 0;
  for(let y=2;y<SAMPLE_HEIGHT-2;y+=1){
    for(let x=3;x<SAMPLE_WIDTH-3;x+=1){
      const pixelIndex=y*SAMPLE_WIDTH+x;
      const dataIndex=pixelIndex*4;
      const luminance=pixels[dataIndex]*.2126+pixels[dataIndex+1]*.7152+pixels[dataIndex+2]*.0722;
      const isStroke=luminance<THRESHOLDS[level];
      mask[pixelIndex]=isStroke?1:0;
      if(isStroke)contentPixels+=1;
    }
  }
  const total=mask.length;
  return {mask,total,contentPixels,coveragePercent:(contentPixels/total)*100,sensitivity:level};
}

export function compareBoardDescriptors(current,baseline) {
  if(!current||!baseline||current.mask.length!==baseline.mask.length){
    return {changePercent:0,frameChangePercent:0};
  }
  let changed=0;
  for(let index=0;index<current.mask.length;index+=1){
    if(current.mask[index]!==baseline.mask[index])changed+=1;
  }
  const denominator=Math.max(baseline.contentPixels,baseline.total*.05);
  return {changePercent:(changed/denominator)*100,frameChangePercent:(changed/current.total)*100};
}

export function boardHasEnoughContent(descriptor,sensitivity='MEDIUM') {
  const minimum=MINIMUM_COVERAGE[sensitivity]??MINIMUM_COVERAGE.MEDIUM;
  return descriptor.coveragePercent>=minimum;
}

export function isBoardStable(current,previous) {
  if(!previous)return false;
  return compareBoardDescriptors(current,previous).frameChangePercent<=STABILITY_CHANGE_PERCENT;
}

export async function descriptorFromImageBlob(blob,sensitivity='MEDIUM') {
  const bitmap=await createImageBitmap(blob);
  try{
    const canvas=document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    canvas.getContext('2d').drawImage(bitmap,0,0);
    return analyzeBoardCanvas(canvas,sensitivity);
  }finally{bitmap.close();}
}
