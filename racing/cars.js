// Asset-local transforms normalize each original export to Y-up / +Z-forward.
export const CARS = {
  porsche: {name:'Porsche 911 GT3 RS · Manthey',url:'assets/porsche-manthey.glb',yaw:Math.PI,eye:[.37,1.02,-.12],look:[.37,1.00,35],hideInDriver:['interior_shell'],clearInDriver:['glass_windscreen'],radius:.352,spinSign:-1,bestKey:'sonoma.best.v1.porsche'},
  roadster: {name:'Blue roadster',url:'assets/blue-roadster.glb',yaw:0,eye:[.36,1.16,-.55],look:[.36,1.12,35],radius:.394,spinSign:1,bestKey:'sonoma.best.v1'}
};
export function initialCar(){const q=new URLSearchParams(location.search).get('car');if(q&&CARS[q])return q;try{const id=localStorage.getItem('sonoma.car');if(CARS[id])return id;}catch{}return 'porsche';}
