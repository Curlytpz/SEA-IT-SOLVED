import MockLightSensorAdapter from './MockLightSensorAdapter';
import RaspberryPiLightSensorAdapter from './RaspberryPiLightSensorAdapter';

export default class LightSensorService {
  constructor(mode='SIMULATED',options={}){
    this.mode=mode;
    this.adapter=mode==='RASPBERRY_PI'?new RaspberryPiLightSensorAdapter(options):new MockLightSensorAdapter();
  }
  start(options){return this.adapter.start(options);}
  stop(){return this.adapter.stop();}
  read(){return this.adapter.read();}
  getStatus(){return this.adapter.getStatus();}
  setSimulatedAmbient(normalized){return this.adapter.setSimulatedAmbient(normalized);}
}
