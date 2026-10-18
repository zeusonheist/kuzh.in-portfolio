// Separate timing curves let the frame settle while the model catches up gently.
export const PANEL_CURVE = 'cubic-bezier(0.76, 0, 0.24, 1)';
export const MODEL_CURVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const DURATION = 1000;
export const DETAIL_CURVE = 'cubic-bezier(0.65, 0, 0.35, 1)';

export async function animatePageChange({reverse, outgoing, revealDestination, restoreOtherModels, startMotion}) {
  // A contracting mask must expose its destination, never the outgoing snapshot.
  if (reverse) {
    outgoing?.remove();
    revealDestination();
    restoreOtherModels();
  }
  await startMotion();
  if (!reverse) {
    outgoing?.remove();
    revealDestination();
  }
}

export function animateDetails(element, distance, column = 0) {
  return element.animate([
    {transform:`translateY(${distance}px)`,opacity:0},
    {transform:'translateY(0px)',opacity:1},
  ], {duration:1000, delay:80 + column * 100, easing:DETAIL_CURVE, fill:'both'});
}

// Normalize the actual exported outline, including its bottom step. H/V segments
// become L segments so every point can move in both axes during the morph.
export function panelShape(d, box, {topStep=false} = {}) {
  const tokens = d.match(/[MLCHVZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g);
  const card = [], rectangle = [];
  let i = 0, command, x = 0, y = 0;
  const number = value => String(Number(value.toFixed(9)));
  function point(px, py) {
    const nx = (px - box.x) / box.width, ny = (py - box.y) / box.height;
    card.push(number(nx), number(ny));
    // Collapse the entire lower step onto the bottom edge; preserve point count
    // and curve commands so the browser interpolates the notch continuously.
    const rx = nx < 0.05 ? 0 : nx > 0.95 ? 1 : nx;
    const ry = ny < (topStep?0.5:0.05) ? 0 : ny > 0.8 ? 1 : ny;
    rectangle.push(number(rx), number(ry));
  }
  while (i < tokens.length) {
    if (/^[MLCHVZ]$/.test(tokens[i])) command = tokens[i++];
    if (command === 'Z') { card.push('Z'); rectangle.push('Z'); command = null; continue; }
    if (!command) throw new Error('Unsupported panel outline');
    const output = command === 'H' || command === 'V' ? 'L' : command;
    card.push(output); rectangle.push(output);
    if (command === 'H') { x = Number(tokens[i++]); point(x, y); }
    else if (command === 'V') { y = Number(tokens[i++]); point(x, y); }
    else {
      const pairs = command === 'C' ? 3 : 1;
      for (let p = 0; p < pairs; p++) { x = Number(tokens[i++]); y = Number(tokens[i++]); point(x, y); }
    }
    if (command === 'M') command = 'L';
  }
  return {card:card.join(' '), rectangle:rectangle.join(' ')};
}

export function frameStyle(box) {
  return {
    transform: `translate3d(${box.left}px, ${box.top}px, 0)`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    borderRadius: `${box.radius ?? 8}px`,
  };
}

// FLIP: each panel is drawn once, then transformed between its measured boxes.
export function flipFrames(from, to) {
  return [
    { transform: `translate3d(${from.left}px, ${from.top}px, 0) scale(${from.width / to.width}, ${from.height / to.height})`, borderRadius: `${from.radius ?? 20}px` },
    { transform: `translate3d(${to.left}px, ${to.top}px, 0) scale(1, 1)`, borderRadius: `${to.radius ?? 8}px` },
  ];
}

export function animatePanel(element, from, to, options = {}) {
  Object.assign(element.style, { width: `${to.width}px`, height: `${to.height}px` });
  const timing = {
    duration: DURATION, easing: PANEL_CURVE, fill: 'both', ...options,
  };
  const frames=flipFrames(from,to);
  if(!element.morphShape && element.morphColor){
    frames[0].backgroundColor=element.morphColor.from;
    frames[1].backgroundColor=element.morphColor.to;
  }
  const transform = element.animate(frames, timing);
  if (!element.morphShape) return transform;
  const shape = element.querySelector('path').animate([
    {d:`path("${element.morphShape.from}")`, ...(element.morphColor ? {fill:element.morphColor.from} : {})},
    {d:`path("${element.morphShape.to}")`, ...(element.morphColor ? {fill:element.morphColor.to} : {})},
  ], timing);
  return {finished:Promise.all([transform.finished, shape.finished]), cancel(){transform.cancel();shape.cancel();}};
}

export function animateModel(element, from, to, {stableSurface=false} = {}) {
  const timing={duration:DURATION-80,delay:80,easing:MODEL_CURVE,fill:'both'};
  const viewer=stableSurface?element.querySelector('model-viewer'):null;
  let surface;
  if(viewer){
    // Keep the WebGL viewport fixed while the surrounding frame morphs. Uniform
    // scaling contains the live model without allocating a new GPU buffer on
    // every animation frame or stretching the geometry to a different aspect.
    Object.assign(viewer.style,{position:'absolute',left:'50%',top:'50%',width:`${to.width}px`,height:`${to.height}px`});
    const scale=Math.min(from.width/to.width,from.height/to.height);
    surface=viewer.animate([
      {transform:`translate(-50%, -50%) scale(${scale})`},
      {transform:'translate(-50%, -50%) scale(1)'},
    ],timing);
  }
  const frame=element.animate([frameStyle(from),frameStyle(to)],timing);
  if(!surface)return frame;
  return {finished:Promise.all([frame.finished,surface.finished]),cancel(){
    frame.cancel();surface.cancel();
    for(const property of ['position','left','top','width','height'])viewer.style.removeProperty(property);
  }};
}
