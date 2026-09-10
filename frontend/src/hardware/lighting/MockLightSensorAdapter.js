function clamp(value,min=0,max=1){return Math.min(max,Math.max(min,Number(value)||0));}

export default class MockLightSensorAdapter {
  constructor(){this.status='STOPPED';this.normalized=.35;}
  async start({normalized=.35}={}){this.normalized=clamp(normalized);this.status='READY';return this.read();}
  stop(){this.status='STOPPED';}
  getStatus(){return this.status;}
  setSimulatedAmbient(normalized){this.normalized=clamp(normalized);return this.normalized;}
  async read(){
    if(this.status!=='READY')throw new Error('The simulated ambient-light sensor is not running.');
    return {lux:Math.round(this.normalized*500),normalized:this.normalized,status:'READY',sampledAt:new Date().toISOString(),simulated:true};
  }
}
