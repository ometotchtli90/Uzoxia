
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let camX=0;
let camY=0;
let zoom=1;

const tileSize=256;
const mapSize=20;

const tiles={};
["grass","water","mountain","sand"].forEach(t=>{
 let img=new Image();
 img.src="tiles/"+t+".png";
 tiles[t]=img;
});

const cloud=new Image();
cloud.src="clouds.png";

const map=[];
for(let y=0;y<mapSize;y++){
 map[y]=[];
 for(let x=0;x<mapSize;x++){
  let types=["grass","water","sand","mountain"];
  map[y][x]=types[Math.floor(Math.random()*types.length)];
 }
}

const explored=[];
for(let y=0;y<mapSize;y++){
 explored[y]=[];
 for(let x=0;x<mapSize;x++) explored[y][x]=false;
}

function reveal(x,y,r=2){
 for(let j=-r;j<=r;j++){
  for(let i=-r;i<=r;i++){
   if(map[y+j] && map[y+j][x+i]!=undefined){
    explored[y+j][x+i]=true;
   }
  }
 }
}

reveal(10,10,3);

let dragging=false;
let lastX,lastY;

canvas.onmousedown=e=>{
 dragging=true;
 lastX=e.clientX;
 lastY=e.clientY;
}

canvas.onmouseup=()=>dragging=false;

canvas.onmousemove=e=>{
 if(dragging){
  camX+=(e.clientX-lastX)/zoom;
  camY+=(e.clientY-lastY)/zoom;
  lastX=e.clientX;
  lastY=e.clientY;
 }
}

canvas.onwheel=e=>{
 zoom*= e.deltaY>0 ? 0.9 : 1.1;
 zoom=Math.max(0.3,Math.min(3,zoom));
}

function draw(){

 ctx.setTransform(zoom,0,0,zoom,canvas.width/2+camX*zoom,canvas.height/2+camY*zoom);
 ctx.clearRect(-10000,-10000,20000,20000);

 for(let y=0;y<mapSize;y++){
  for(let x=0;x<mapSize;x++){
   let img=tiles[map[y][x]];
   let px=x*tileSize;
   let py=y*tileSize;

   ctx.drawImage(img,px,py,tileSize,tileSize);

   if(!explored[y][x]){
    ctx.drawImage(cloud,px,py,tileSize,tileSize);
   }
  }
 }

 if(zoom<0.6){
  for(let y=0;y<mapSize;y++){
   for(let x=0;x<mapSize;x++){
    ctx.drawImage(cloud,x*tileSize,y*tileSize,tileSize,tileSize);
   }
  }
 }

 requestAnimationFrame(draw);
}

draw();
