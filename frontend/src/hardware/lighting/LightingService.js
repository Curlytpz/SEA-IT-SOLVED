import MockLightingAdapter from './MockLightingAdapter';
import RaspberryPiLightingAdapter from './RaspberryPiLightingAdapter';

export default class LightingService {
  constructor(mode='SIMULATED',options={}){
    this.hardwareMode=mode;
    this.adapter=mode==='RASPBERRY_PI'?new RaspberryPiLightingAdapter(options):new MockLightingAdapter();
  }
  start(options){return this.adapter.start(options);}
  stop(options){return this.adapter.stop(options);}
  getStatus(){return this.adapter.getStatus();}
  setMode(mode){return this.adapter.setMode(mode);}
  turnOn(){return this.adapter.turnOn();}
  turnOff(){return this.adapter.turnOff();}
  setBrightness(value){return this.adapter.setBrightness(value);}
}
