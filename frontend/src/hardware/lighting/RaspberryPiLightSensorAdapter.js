export default class RaspberryPiLightSensorAdapter {
  constructor({sensorDriver='generic-lux'}={}){this.sensorDriver=sensorDriver;this.status='UNAVAILABLE';}
  async start(){this.status='UNAVAILABLE';throw new Error('Raspberry Pi ambient-light sensing is not available in this phase.');}
  stop(){this.status='STOPPED';}
  getStatus(){return this.status;}
  async read(){throw new Error('Raspberry Pi ambient-light sensing is not available in this phase.');}
  setSimulatedAmbient(){throw new Error('Simulated ambient light is unavailable for Raspberry Pi hardware.');}
}
