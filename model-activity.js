// The live model remains mounted (including its camera), but only visible models
// rotate. Pause during transitions so WebGL does not compete with the page motion.
export function modelActivity({document, reducedMotion, IntersectionObserver}) {
  const frames=new Map();
  let moving=false;
  function update(frame) {
    const rotate=frames.get(frame) && !frame.hidden && !document.hidden && !moving && !reducedMotion.matches;
    const viewer=frame.querySelector('model-viewer');
    if(viewer.hasAttribute('auto-rotate')!==Boolean(rotate))viewer.toggleAttribute('auto-rotate',Boolean(rotate));
  }
  function refresh(){for(const frame of frames.keys())update(frame);}
  const observer=IntersectionObserver?new IntersectionObserver(entries=>{
    for(const entry of entries){frames.set(entry.target,entry.isIntersecting);update(entry.target);}
  }):null;
  document.addEventListener('visibilitychange',refresh);
  reducedMotion.addEventListener('change',refresh);
  return {
    track(frame,visible){if(!frames.has(frame))observer?.observe(frame);frames.set(frame,visible);update(frame);},
    moving(value){moving=value;refresh();},
  };
}
