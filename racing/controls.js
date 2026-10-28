// Standard-layout gamepad only. No network, HID permission, or wheel-driver dependency.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function stick(value,deadzone=.07){if(!Number.isFinite(value)||Math.abs(value)<=deadzone)return 0;return Math.sign(value)*Math.pow(clamp((Math.abs(value)-deadzone)/(1-deadzone),0,1),1.45);}
export function gamepadIntent(pad){if(!pad||pad.mapping!=='standard'||!pad.connected)return {turn:0,throttle:0,brake:0,analog:false};const pedal=i=>clamp(Number(pad.buttons[i]?.value)||0,0,1);return {turn:-stick(pad.axes[0]),throttle:pedal(7),brake:pedal(6),analog:true};}
export class GamepadControls{
 constructor(){this.pad=null;this.buttons=[];this.cooldown=0;}
 poll(actions){let pads=[];try{pads=navigator.getGamepads?.()||[];}catch{}this.pad=Array.from(pads).find(p=>p?.connected&&p.mapping==='standard')||null;const next=this.pad?.buttons.map(b=>b.pressed)||[];for(const [button,action]of [[9,'pause'],[3,'camera'],[1,'recover']])if(next[button]&&!this.buttons[button])actions[action]?.();this.buttons=next;return gamepadIntent(this.pad);}
 rumble(dt,active,s){this.cooldown-=dt;const actuator=this.pad?.vibrationActuator;if(!active||!actuator){if(this.wasActive){try{actuator?.reset()?.catch(()=>{});}catch{}}this.wasActive=false;return;}this.wasActive=true;if(this.cooldown>0)return;this.cooldown=.10;const strong=clamp(s.impact*.65,0,.65),weak=clamp(s.tyreScrub*.20+(s.off&&s.speed>3?.10:0),0,.3);if(strong+weak<.015)return;try{actuator.playEffect('dual-rumble',{duration:110,strongMagnitude:strong,weakMagnitude:weak}).catch(()=>{});}catch{}}
}
