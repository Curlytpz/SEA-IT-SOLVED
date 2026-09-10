export default class RaspberryPiLightingAdapter {
  constructor({lightingDriver='generic-led'}={}){this.lightingDriver=lightingDriver;this.status='UNAVAILABLE';this.mode='AUTO';this.ledOn=false;this.brightness=.8;}
  unavailable(){throw new Error('Raspberry Pi LED control is not available in this phase.');}
  async start(){this.status='UNAVAILABLE';return this.unavailable();}
  getStatus(){return {status:this.status,mode:this.mode,ledOn:this.ledOn,brightness:this.brightness,simulated:false};}
  setMode(){return this.unavailable();}
  turnOn(){return this.unavailable();}
  turnOff(){return this.unavailable();}
  setBrightness(){return this.unavailable();}
  stop(){this.status='STOPPED';this.ledOn=false;return this.getStatus();}
}
