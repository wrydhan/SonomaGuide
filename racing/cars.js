import {PROFILES} from './performance.js';
// Asset-local transforms normalize each original export to Y-up / +Z-forward.
export const CARS = {
  daytona: {name:'Ferrari Daytona SP3',url:'assets/ferrari-daytona-sp3.glb',yaw:0,eye:[.33,1,.12],look:[.33,.97,35],clearInDriver:['glass_windscreen','glass_door_'],radius:.3335,spinSign:1,bestKey:'sonoma.best.v3.daytona',profile:PROFILES.daytona,splitWheels:true,steering:{node:'interior_steering',centre:[.33,.70,.62],shaft:22,paddleDepth:.045,paddleOffset:.04}},
  ferrari296: {name:'Ferrari 296 GTB',url:'assets/ferrari-296-gtb.glb',yaw:0,eye:[.36,1.01,-.02],look:[.36,.98,35],clearInDriver:['glass_cabin'],radius:.3398,spinSign:1,bestKey:'sonoma.best.v3.ferrari296',profile:PROFILES.ferrari296,splitWheels:true,steering:{node:'interior_steering_wheel',centre:[.36,.68,.38],shaft:22,paddleDepth:.03,paddleOffset:.09}},
  bugatti: {name:'Bugatti Tourbillon',url:'assets/bugatti-tourbillon.glb',yaw:0,eye:[.335,.96,.02],look:[.335,.93,35],clearInDriver:['glass_cabin'],radius:.362,spinSign:1,bestKey:'sonoma.best.v3.bugatti',profile:PROFILES.bugatti},
  porsche: {name:'Porsche 911 GT3 RS · Manthey',url:'assets/porsche-manthey.glb',yaw:Math.PI,eye:[.37,1.02,-.12],look:[.37,1.00,35],hideInDriver:['interior_shell'],clearInDriver:['glass_windscreen'],radius:.352,spinSign:-1,bestKey:'sonoma.best.v3.porsche',profile:PROFILES.porsche},
  roadster: {name:'Blue roadster',url:'assets/blue-roadster.glb',yaw:0,eye:[.36,1.16,-.55],look:[.36,1.12,35],radius:.394,spinSign:1,bestKey:'sonoma.best.v3.roadster',profile:PROFILES.roadster}
};
export function initialCar(){const q=new URLSearchParams(location.search).get('car');if(q&&Object.hasOwn(CARS,q))return q;try{const id=localStorage.getItem('sonoma.car');if(Object.hasOwn(CARS,id))return id;}catch{}return 'bugatti';}
