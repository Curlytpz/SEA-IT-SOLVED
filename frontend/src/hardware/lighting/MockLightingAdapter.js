function clamp(value){return Math.min(1,Math.max(0,Number(value)||0));}

export default class MockLightingAdapter {
  constructor(){this.status='STOPPED';this.mode='AUTO';this.ledOn=false;this.brightness=.8;}
  async start({mode='AUTO',brightness=.8}={}){this.status='READY';this.setBrightness(brightness);this.setMode(mode);return this.getStatus();}
  getStatus(){return {status:this.status,mode:this.mode,ledOn:this.ledOn,brightness:this.brightness,simulated:true};}
  setMode(mode){if(!['AUTO','ON','OFF'].includes(mode))throw new Error('Lighting mode must be AUTO, ON, or OFF.');this.mode=mode;if(mode==='ON')this.turnOn();if(mode==='OFF')this.turnOff();return this.getStatus();}
  turnOn(){this.ledOn=true;return this.getStatus();}
  turnOff(){this.ledOn=false;return this.getStatus();}
  setBrightness(value){this.brightness=clamp(value);return this.getStatus();}
  stop({preserveOn=false}={}){if(!preserveOn)this.ledOn=false;this.status='STOPPED';return this.getStatus();}
}
