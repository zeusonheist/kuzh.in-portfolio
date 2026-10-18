export const WORK_DURATION = 1300;
const PANEL_CURVE = 'cubic-bezier(0.65, 0, 0.35, 1)';

const running = new WeakMap();
const ROTATION_END = 0.3;
const WIDTH_END = 0.6;
const HEIGHT_SHRINK_END = 1 - WIDTH_END;
const SHRINK_END = 1 - ROTATION_END;
const OPEN_TRANSFORM = 'translate(0px, 0px) rotate(0deg)';
const OPEN_CLIP = 'inset(0px 0px 0px 0px round 8px)';
const outlineSizes = new WeakMap();

// One continuous outline replaces overlapping borders at the tab/panel join.
export function workspaceOutline(width, height, tabWidth = 104) {
  const edge=width-0.5,bottom=height-0.5,tab=width-tabWidth;
  return `M${tab+8} 0.5H${edge-8}Q${edge} 0.5 ${edge} 8.5V${bottom-8}Q${edge} ${bottom} ${edge-8} ${bottom}H8.5Q0.5 ${bottom} 0.5 ${bottom-8}V36.5Q0.5 28.5 8.5 28.5H${tab-8}Q${tab} 28.5 ${tab} 20.5V8.5Q${tab} 0.5 ${tab+8} 0.5Z`;
}

function syncWorkspaceOutline(workspace) {
  if(!workspace.isConnected || workspace.dataset.animating)return;
  const box=workspace.getBoundingClientRect();
  if(box.width<=0)return;
  const active=workspace.dataset.active;
  const tabWidth=workspace.querySelector(`[data-work-tab="${active}"]`)?.offsetWidth||104;
  const signature=`${box.width}:${box.height}:${active}:${tabWidth}`;
  if(outlineSizes.get(workspace)===signature)return;
  outlineSizes.set(workspace,signature);
  const connected=active==='process'||active==='renders';
  workspace.dataset.connected=connected?active:'none';
  for(const svg of workspace.querySelectorAll('.work-surface,.work-outline')){
    svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
    const path=svg.querySelector('path');
    path.setAttribute('d',workspaceOutline(box.width,box.height,tabWidth));
    path.setAttribute('transform',active==='renders'?`translate(${box.width} 0) scale(-1 1)`:'');
  }
}

const observed=new WeakSet();
const outlineObserver=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{
  for(const {target} of entries){
    if(target.isConnected)syncWorkspaceOutline(target);
    else outlineObserver.unobserve(target);
  }
}):null;

export function syncWorkspaces(root) {
  for(const workspace of root.querySelectorAll('.project-workspace')){
    syncWorkspaceOutline(workspace);
    if(outlineObserver&&!observed.has(workspace)){outlineObserver.observe(workspace);observed.add(workspace);}
  }
}

// A quarter-turn swaps the axes: the full panel folds into a vertical edge tab.
export function foldedTransform(full, tab, side) {
  const left = tab.left - full.left + (side === 'renders' ? tab.width : 0);
  const top = tab.top - full.top + (side === 'process' ? tab.height : 0);
  return `translate(${left}px, ${top}px) rotate(${side === 'renders' ? 90 : -90}deg)`;
}

// After the quarter-turn, keep the box at button size before expanding it.
export function horizontalTabTransform(full, tab, side) {
  const left = tab.left - full.left + (side === 'process' ? tab.width - tab.height : 0);
  return `translate(${left}px, ${tab.top-full.top}px) rotate(0deg)`;
}

export function tabClip(full, tab, fullWidth = false) {
  return `inset(0px ${fullWidth ? 0 : Math.max(0,full.width-tab.height)}px ${Math.max(0,full.height-tab.width)}px 0px round 8px 8px 0px 0px)`;
}

function fullWidthBar(full, tab) {
  return `translate(0px, ${tab.top-full.top}px) rotate(0deg)`;
}

export function outlineFrames(full, frames) {
  return frames.map(({offset,easing,clipPath})=>{
    const [,right,bottom]=clipPath.match(/inset\(0px ([\d.]+)px ([\d.]+)px/);
    const borderRadius=clipPath.match(/round ([^)]+)\)/)[1];
    return {offset,easing,width:`${full.width-Number(right)}px`,height:`${full.height-Number(bottom)}px`,borderRadius};
  });
}

export function settleWorkspace(workspace, active) {
  workspace.dataset.active = active;
  for (const pane of workspace.querySelectorAll('[data-work-pane]')) {
    const open = pane.dataset.workPane === active;
    pane.hidden = !open;
    pane.inert = !open;
    pane.style.removeProperty('position');
    pane.style.removeProperty('top');
    pane.style.removeProperty('left');
    pane.style.removeProperty('width');
    pane.style.removeProperty('transform-origin');
  }
  for (const button of workspace.querySelectorAll('[data-work-tab]')) button.setAttribute('aria-expanded', String(button.dataset.workTab === active));
  workspace.style.removeProperty('height');
  delete workspace.dataset.opening;
  delete workspace.dataset.closing;
  delete workspace.dataset.animating;
  syncWorkspaceOutline(workspace);
}

export function resetWorkspaceScroll(workspace) {
  for(const pane of workspace.querySelectorAll('[data-work-pane]')){
    pane.scrollTop=0;
    pane.scrollLeft=0;
  }
  const view=workspace.ownerDocument?.defaultView;
  if(!view)return;
  const top=workspace.getBoundingClientRect().top+view.scrollY;
  // Reset before measuring the transition so a previously floating button
  // expands from the gallery header, with the first image in view.
  view.scrollTo({top:Math.max(0,top),left:view.scrollX,behavior:'instant'});
}

export async function switchWorkspace(workspace, requested, reducedMotion = false) {
  if (running.has(workspace)) return;
  const rootStyle=workspace.ownerDocument?.documentElement?.style;
  const previousAnchor=rootStyle?.overflowAnchor;
  if(rootStyle)rootStyle.overflowAnchor='none';
  const finishScroll=()=>{
    try {
      // Reapply after restoring normal-flow panes and removing the temporary
      // animated height. Those changes can otherwise move/clamp the viewport.
      if(workspace.isConnected!==false)resetWorkspaceScroll(workspace);
    } finally {
      if(rootStyle){
        if(previousAnchor)rootStyle.overflowAnchor=previousAnchor;
        else rootStyle.removeProperty('overflow-anchor');
      }
    }
  };
  resetWorkspaceScroll(workspace);
  const previous = workspace.dataset.active;
  const next = previous === requested ? 'none' : requested;
  const outgoing = workspace.querySelector(`[data-work-pane="${previous}"]`);
  const incoming = workspace.querySelector(`[data-work-pane="${next}"]`);
  if (reducedMotion || typeof workspace.animate !== 'function') {
    try {settleWorkspace(workspace,next);} finally {finishScroll();}
    return;
  }
  const before = workspace.getBoundingClientRect();
  const oldBox = outgoing?.getBoundingClientRect();
  const openingTab = incoming ? workspace.querySelector(`[data-work-tab="${next}"]`).getBoundingClientRect() : null;
  const animations=[];
  const outlines=[];
  const animatePane=(pane,box,frames,timing)=>{
    animations.push(pane.animate(frames,timing));
    if(!pane.ownerDocument)return;
    const outline=pane.ownerDocument.createElement('div');
    outline.className='work-motion-outline';outline.setAttribute('aria-hidden','true');
    pane.append(outline);outlines.push(outline);
    animations.push(outline.animate(outlineFrames(box,frames),timing));
  };
  let cleaned=false;
  const cleanup=()=>{
    if(cleaned)return;cleaned=true;
    for(const animation of animations)animation.cancel();
    for(const outline of outlines)outline.remove();
    try {settleWorkspace(workspace,next);} finally {finishScroll();running.delete(workspace);}
  };
  running.set(workspace,{cancel:cleanup});
  try {
    workspace.dataset.animating='true';
    workspace.style.height=`${before.height}px`;
    if(incoming){incoming.hidden=false;incoming.inert=false;}
    // Both panels temporarily share a fixed surface while their height and shape
    // move together. The next-project preview follows the workspace's height.
    for(const pane of [outgoing,incoming].filter(Boolean))Object.assign(pane.style,{
      position:'absolute',left:'0px',top:'28px',width:`${before.width}px`,transformOrigin:'0 0',
    });
    const targetBox=incoming?.getBoundingClientRect();
    const targetHeight=incoming ? targetBox.height+28 : 112;
    workspace.dataset.opening=next;
    workspace.dataset.closing=previous;
    workspace.dataset.active=next;
    for(const button of workspace.querySelectorAll('[data-work-tab]'))button.setAttribute('aria-expanded',String(button.dataset.workTab===next));
    // Reveal the original artwork through a growing box: rotate, fill across,
    // then fill down. Clipping keeps images at their natural proportions.
    const timing={duration:WORK_DURATION,easing:'linear',fill:'both'};
    if(incoming)animatePane(incoming,targetBox,[
      {offset:0,transform:foldedTransform(targetBox,openingTab,next),clipPath:tabClip(targetBox,openingTab),easing:PANEL_CURVE},
      {offset:ROTATION_END,transform:horizontalTabTransform(targetBox,openingTab,next),clipPath:tabClip(targetBox,openingTab),easing:PANEL_CURVE},
      {offset:WIDTH_END,transform:fullWidthBar(targetBox,openingTab),clipPath:tabClip(targetBox,openingTab,true),easing:PANEL_CURVE},
      {offset:1,transform:OPEN_TRANSFORM,clipPath:OPEN_CLIP},
    ],timing);
    if(outgoing){
      outgoing.inert=true;
      // The closing tab has just become inactive, so measure its new sticky
      // position rather than the active header that may have scrolled away.
      const controls=workspace.querySelector(`.work-control-${previous}`)?.getBoundingClientRect() || before;
      const button=workspace.querySelector(`[data-work-tab="${previous}"]`);
      const width=button.offsetHeight||28,height=button.offsetWidth||104;
      const tab={left:previous==='renders'?controls.left-7:controls.right+7-width,top:controls.top,width,height};
      animatePane(outgoing,oldBox,[
        {offset:0,transform:OPEN_TRANSFORM,clipPath:OPEN_CLIP,easing:PANEL_CURVE},
        {offset:HEIGHT_SHRINK_END,transform:fullWidthBar(oldBox,tab),clipPath:tabClip(oldBox,tab,true),easing:PANEL_CURVE},
        {offset:SHRINK_END,transform:horizontalTabTransform(oldBox,tab,previous),clipPath:tabClip(oldBox,tab),easing:PANEL_CURVE},
        {offset:1,transform:foldedTransform(oldBox,tab,previous),clipPath:tabClip(oldBox,tab)},
      ],timing);
    }
    const oldHeight=`${before.height}px`,newHeight=`${targetHeight}px`;
    animations.push(workspace.animate(incoming ? [
      {offset:0,height:oldHeight},
      {offset:WIDTH_END,height:oldHeight,easing:PANEL_CURVE},
      {offset:1,height:newHeight},
    ] : [
      {offset:0,height:oldHeight,easing:PANEL_CURVE},
      {offset:HEIGHT_SHRINK_END,height:newHeight},
      {offset:1,height:newHeight},
    ],timing));
    await Promise.all(animations.map(animation=>animation.finished));
  } catch(error) {
    if(error.name!=='AbortError')console.error('Panel transition failed:',error);
  } finally {cleanup();}
}

export function cancelWorkspaces(root) {
  for(const workspace of root.querySelectorAll('.project-workspace')){
    running.get(workspace)?.cancel();
    outlineObserver?.unobserve(workspace);observed.delete(workspace);
  }
}
