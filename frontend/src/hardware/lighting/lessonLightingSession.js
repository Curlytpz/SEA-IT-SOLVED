import LightSensorService from './LightSensorService';
import LightingService from './LightingService';

export const DEFAULT_LIGHTING_SETTINGS={
  lightingHardwareMode:'SIMULATED',
  lightingMode:'AUTO',
  lightingThresholdPercent:30,
  lightingHysteresisPercent:5,
  lightingBrightnessPercent:80,
  simulatedAmbientLightPercent:35,
};

function percent(value,fallback){const parsed=Number(value);return Number.isFinite(parsed)?Math.min(100,Math.max(0,parsed)):fallback;}
function normalizeSettings(input={}){
  const settings={...DEFAULT_LIGHTING_SETTINGS,...input};
  const threshold=percent(settings.lightingThresholdPercent,30);
  const hysteresis=Math.min(50,percent(settings.lightingHysteresisPercent,5));
  return {
    lightingHardwareMode:['SIMULATED','RASPBERRY_PI'].includes(settings.lightingHardwareMode)?settings.lightingHardwareMode:'SIMULATED',
    lightingMode:['AUTO','ON','OFF'].includes(settings.lightingMode)?settings.lightingMode:'AUTO',
    lightingThresholdPercent:Math.min(threshold,100-hysteresis),
    lightingHysteresisPercent:hysteresis,
    lightingBrightnessPercent:percent(settings.lightingBrightnessPercent,80),
    simulatedAmbientLightPercent:percent(settings.simulatedAmbientLightPercent,35),
  };
}

export class LightingRuntime {
  constructor(){
    this.sensor=new LightSensorService('SIMULATED');this.lighting=new LightingService('SIMULATED');this.listeners=new Set();this.timer=null;this.tickBusy=false;this.belowCount=0;this.aboveCount=0;this.readErrors=0;this.contextKind=null;
    this.settings=normalizeSettings();
    this.state={contextId:null,lessonId:null,status:'STOPPED',sensorStatus:'STOPPED',mode:'AUTO',ambientLux:null,ambientNormalized:.35,filteredNormalized:null,ledOn:false,brightness:.8,monitoring:false,simulated:true,error:'',sampledAt:null};
  }

  snapshot(){return {...this.state};}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  emit(overrides={}){this.state={...this.state,...overrides};this.listeners.forEach(listener=>listener(this.snapshot()));}
  clearTimer(){clearInterval(this.timer);this.timer=null;}

  async initialize(contextId,settings,kind){
    await this.stopRuntime({preserveManualOn:false,clearContext:true});
    this.settings=normalizeSettings(settings);this.contextKind=kind;
    const hardwareMode=this.settings.lightingHardwareMode;
    this.sensor=new LightSensorService(hardwareMode);this.lighting=new LightingService(hardwareMode);
    this.belowCount=0;this.aboveCount=0;this.readErrors=0;
    this.emit({contextId,lessonId:kind==='LESSON'?contextId:null,status:'STARTING',sensorStatus:'STARTING',mode:this.settings.lightingMode,ambientNormalized:this.settings.simulatedAmbientLightPercent/100,filteredNormalized:null,ledOn:false,brightness:this.settings.lightingBrightnessPercent/100,monitoring:false,simulated:hardwareMode==='SIMULATED',error:''});
    try{
      await this.lighting.start({mode:this.settings.lightingMode,brightness:this.settings.lightingBrightnessPercent/100});
      await this.sensor.start({normalized:this.settings.simulatedAmbientLightPercent/100});
      const lightingStatus=this.lighting.getStatus();
      this.emit({status:'READY',sensorStatus:this.sensor.getStatus(),ledOn:lightingStatus.ledOn,brightness:lightingStatus.brightness,monitoring:true});
      await this.tick();this.timer=setInterval(()=>this.tick(),500);return this.snapshot();
    }catch(error){
      this.clearTimer();
      const lightingStatus=this.lighting.getStatus();
      this.emit({status:'ERROR',sensorStatus:this.sensor.getStatus(),ledOn:lightingStatus.ledOn,monitoring:false,error:error.message||'Lighting is unavailable.'});
      throw error;
    }
  }

  startLesson(lessonId,settings){if(this.state.lessonId===lessonId&&this.state.monitoring)return this.updateSettings(settings);return this.initialize(lessonId,settings,'LESSON');}
  startPreview(settings){if(this.contextKind==='LESSON')return this.updateSettings(settings);return this.initialize('HARDWARE_SETTINGS',settings,'SETTINGS');}

  async tick(){
    if(this.tickBusy||!this.state.monitoring)return;this.tickBusy=true;
    try{
      const reading=await this.sensor.read();
      const current=Math.min(1,Math.max(0,Number(reading.normalized)));
      if(!Number.isFinite(current))throw new Error('Ambient-light reading is invalid.');
      const filtered=this.state.filteredNormalized===null?current:.25*current+.75*this.state.filteredNormalized;
      this.readErrors=0;
      if(this.settings.lightingMode==='ON'){await this.lighting.turnOn();this.belowCount=0;this.aboveCount=0;}
      else if(this.settings.lightingMode==='OFF'){await this.lighting.turnOff();this.belowCount=0;this.aboveCount=0;}
      else{
        const threshold=this.settings.lightingThresholdPercent/100;
        const offThreshold=(this.settings.lightingThresholdPercent+this.settings.lightingHysteresisPercent)/100;
        const ledOn=this.lighting.getStatus().ledOn;
        if(!ledOn&&filtered<threshold){this.belowCount+=1;this.aboveCount=0;if(this.belowCount>=2){await this.lighting.turnOn();this.belowCount=0;}}
        else if(ledOn&&filtered>=offThreshold){this.aboveCount+=1;this.belowCount=0;if(this.aboveCount>=2){await this.lighting.turnOff();this.aboveCount=0;}}
        else{this.belowCount=0;this.aboveCount=0;}
      }
      const lightingStatus=this.lighting.getStatus();
      this.emit({status:'READY',sensorStatus:reading.status,ambientLux:reading.lux??null,ambientNormalized:current,filteredNormalized:filtered,ledOn:lightingStatus.ledOn,brightness:lightingStatus.brightness,error:'',sampledAt:reading.sampledAt});
    }catch(error){
      this.readErrors+=1;
      if(this.readErrors>=3){this.clearTimer();this.emit({status:'ERROR',sensorStatus:'ERROR',monitoring:false,error:'Lighting monitoring is unavailable. Open Hardware Settings to check the simulated hardware.'});}
    }finally{this.tickBusy=false;}
  }

  async updateSettings(nextSettings){
    const next=normalizeSettings({...this.settings,...nextSettings});
    if(next.lightingHardwareMode!==this.settings.lightingHardwareMode&&this.state.contextId)return this.initialize(this.state.contextId,next,this.contextKind||'SETTINGS');
    this.settings=next;this.belowCount=0;this.aboveCount=0;
    this.sensor.setSimulatedAmbient(next.simulatedAmbientLightPercent/100);
    await this.lighting.setBrightness(next.lightingBrightnessPercent/100);
    await this.lighting.setMode(next.lightingMode);
    const lightingStatus=this.lighting.getStatus();
    this.emit({mode:next.lightingMode,ambientNormalized:next.simulatedAmbientLightPercent/100,ledOn:lightingStatus.ledOn,brightness:lightingStatus.brightness});
    if(this.state.monitoring)await this.tick();return this.snapshot();
  }

  async setSimulatedAmbientPercent(value){return this.updateSettings({simulatedAmbientLightPercent:percent(value,35)});}

  async testLight(){
    if(!this.state.contextId)await this.startPreview(this.settings);
    await this.lighting.turnOn();this.emit({ledOn:true,status:'TESTING'});
    await new Promise(resolve=>setTimeout(resolve,700));
    await this.lighting.setMode(this.settings.lightingMode);
    if(this.settings.lightingMode==='AUTO')await this.tick();
    const status=this.lighting.getStatus();this.emit({status:'READY',ledOn:status.ledOn});return this.snapshot();
  }

  async stopRuntime({preserveManualOn=this.settings.lightingMode==='ON',clearContext=false}={}){
    this.clearTimer();this.sensor.stop();
    if(preserveManualOn)await this.lighting.turnOn();else await this.lighting.turnOff();
    const lightingStatus=await this.lighting.stop({preserveOn:preserveManualOn});
    this.emit({status:preserveManualOn?'MANUAL_ON':'STOPPED',sensorStatus:'STOPPED',monitoring:false,ledOn:lightingStatus.ledOn,error:'',...(clearContext?{contextId:null,lessonId:null}:{})});
    if(clearContext)this.contextKind=null;
    return this.snapshot();
  }

  endLesson(){return this.stopRuntime({preserveManualOn:this.settings.lightingMode==='ON',clearContext:true});}
  abortStart(){return this.endLesson();}
  stopPreview(){if(this.contextKind==='LESSON')return Promise.resolve(this.snapshot());return this.stopRuntime({preserveManualOn:this.settings.lightingMode==='ON',clearContext:true});}
}

export default new LightingRuntime();
