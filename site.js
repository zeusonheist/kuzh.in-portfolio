import { animatePanel, animateModel, frameStyle, panelShape, animatePageChange, animateDetails, DURATION } from './motion.js';
import { modelActivity } from './model-activity.js';
import { syncPreviews } from './preview.js';

const PROJECTS = {
  hallmark: { name: 'Hallmark CE bike', outer: '#CCCCCC', inner: '#A1A1A1', orbit: '-35deg 70deg 110%', model: 'models/hallmark.glb?v=hallmark-bike-compressed' },
  soundboy: { name: 'Soundboy synthesizer', outer: '#96C2F2', inner: '#095CB7', orbit: '25deg 55deg 110%', lighting: {exposure: '0.85', 'tone-mapping': 'aces', 'shadow-intensity': '1.2', 'shadow-softness': '0.65'} },
  tensile: { name: 'Tensile modular EV charging', outer: '#FF7979', inner: '#D31010', orbit: '35deg 65deg 110%', model: 'models/tensile.glb?v=tensile-battery-compressed' },
  wisp: { name: 'Wisp lamp', outer: '#464646', inner: '#000000', orbit: '-30deg 75deg 110%' },
};
const mobile = matchMedia('(max-width: 600px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const activity=modelActivity({document,reducedMotion,IntersectionObserver:window.IntersectionObserver});
const viewers = new Map();
let viewerModule;
let pendingModels = [];
let loadingModel = null;
const startedModels = new Set();
function loadViewer() {
  return viewerModule ||= import('./vendor/model-viewer.min.js');
}
function loadNextModel() {
  if (loadingModel) return;
  const next = pendingModels.shift();
  window.portfolioImages?.modelLoading(Boolean(next));
  if (!next) return;
  const {project, frame} = next;
  const viewer = frame.querySelector('model-viewer');
  loadingModel = project;
  startedModels.add(project);
  const finish = () => {
    if (loadingModel !== project) return;
    loadingModel = null;
    loadNextModel();
  };
  viewer.addEventListener('load', finish, {once: true});
  viewer.addEventListener('error', finish, {once: true});
  loadViewer().then(() => {
    viewer.setAttribute('src', PROJECTS[project].model || `models/${project}.glb`);
  }).catch(() => {
    frame.dataset.error = 'true';
    frame.querySelector('.model-progress').hidden = true;
    viewer.setAttribute('alt', `${PROJECTS[project].name}. The 3D viewer could not load.`);
    finish();
  });
}
const detailAnimations = new Set();
const pages = new Map();
const deck = document.createElement('div');
deck.className = 'model-deck';
document.body.append(deck);
let main = document.querySelector('main');
let busy = false;
let homeScroll = null;
let pendingHistoryURL = null;
let currentURL = location.href;
let scheduled = false;
const home = () => document.body.dataset.page === 'homepage';
const isProject = () => Object.hasOwn(PROJECTS,document.body.dataset.page);
const svg = () => main.querySelector('.design');
const projectRoot = () => mobile.matches && isProject() ? main.querySelector('.mobile-project') : svg();
const layoutName = () => home() ? (mobile.matches ? 'mobile' : 'desktop') : 'hero';

function slots() {
  const primary = [...projectRoot().querySelectorAll('[data-model-slot]')].filter(slot => slot.dataset.layout === layoutName());
  return primary.concat([...main.querySelectorAll('.next-project [data-model-slot]')]);
}

function slotRadius(slot) {
  const artwork = slot.ownerSVGElement;
  return artwork ? (parseFloat(slot.getAttribute?.('rx'))||8)*artwork.getBoundingClientRect().width/artwork.viewBox.baseVal.width
    : parseFloat(getComputedStyle(slot).borderRadius)||8;
}

function layout() {
  window.portfolioStartup.mountArtwork(main, mobile.matches);
  window.portfolioImages?.observe(main);
  if (!mobile.matches) prepareDetails();
  syncPreviews(main,mobile.matches);
  positionAboutContacts();
  if (!busy) positionModels();
}

function positionAboutContacts() {
  if (document.body.dataset.page !== 'about') return;
  const contacts = main.querySelector('.about-contacts');
  if (!contacts) return;
  contacts.style.removeProperty('transform');
  if (mobile.matches) return;
  const details = main.querySelector('[data-about-details]');
  const firstLink = contacts.querySelector('.about-contact-link');
  if (!details || !firstLink) return;
  const gap = Math.max(0, firstLink.getBoundingClientRect().top - details.getBoundingClientRect().bottom);
  contacts.style.transform = `translateY(${-gap / 3}px)`;
}

function getViewer(project) {
  if (viewers.has(project)) return viewers.get(project);
  const frame = document.createElement('div');
  frame.className = 'model-frame';
  frame.dataset.project = project;
  const viewer = document.createElement('model-viewer');
  const attributes = {
    alt: `Interactive 3D model of ${PROJECTS[project].name}. Drag to rotate; pinch or scroll to zoom.`,
    'camera-controls': '', 'touch-action': 'pan-y',
    'camera-orbit': PROJECTS[project].orbit,
    'min-camera-orbit': 'auto auto 65%', 'max-camera-orbit': 'auto auto 250%',
    'environment-image': 'neutral', exposure: '1',
    'shadow-intensity': '1', 'shadow-softness': '0.8',
    'interaction-prompt': 'none', 'disable-pan': '', loading: 'eager',
    'rotation-per-second': '18deg', 'auto-rotate-delay': '800',
    ...PROJECTS[project].lighting,
  };
  for (const [key, value] of Object.entries(attributes)) viewer.setAttribute(key, value);
  const progress = document.createElement('div');
  progress.slot = 'progress-bar';
  progress.className = 'model-progress';
  const bar = document.createElement('span');
  progress.append(bar);
  viewer.append(progress);
  viewer.addEventListener('progress', event => {
    const value = event.detail.totalProgress;
    bar.style.transform = `scaleX(${value})`;
    progress.hidden = value >= 1;
  });
  viewer.addEventListener('load', () => { frame.dataset.loaded = 'true'; progress.hidden = true; });
  viewer.addEventListener('error', () => {
    progress.hidden = true;
    frame.dataset.error = 'true';
    viewer.setAttribute('alt', `${PROJECTS[project].name}. The 3D model could not load.`);
  });
  frame.append(viewer);
  deck.append(frame);
  viewers.set(project, frame);
  return frame;
}

function positionModels(exceptProject = null, forceProject = null) {
  const active = new Set();
  const requests = [];
  const measured=slots().map(slot=>({slot,box:slot.getBoundingClientRect(),radius:slotRadius(slot)}));
  for (const {slot,box,radius} of measured) {
    const project = slot.dataset.modelSlot;
    active.add(project);
    if (project === exceptProject) continue;
    const visible=box.bottom>0 && box.top<innerHeight && box.width>0;
    const nearby=box.width>0 && box.bottom>=-300 && box.top<=innerHeight+300;
    if(!viewers.has(project) && project!==forceProject && (busy || !nearby))continue;
    const frame = getViewer(project);
    if(project===forceProject || nearby)requests.push({project,frame,priority:project===forceProject?0:visible?1:2});
    frame.hidden = false;
    frame.style.position = 'absolute';
    Object.assign(frame.style, frameStyle({ ...box.toJSON(), top: box.top + window.scrollY, radius }));
    activity.track(frame,visible);
  }
  for (const [project, frame] of viewers) if(!active.has(project)){frame.hidden=true;activity.track(frame,false);}
  pendingModels = requests.filter(({project}) => !startedModels.has(project)).sort((a,b) => a.priority-b.priority);
  window.portfolioImages?.modelLoading(pendingModels.length>0 || requests.some(({project}) => project===loadingModel));
  loadNextModel();
}

const nearModels=new IntersectionObserver(entries=>{
  if(entries.length)scheduleLayout();
},{rootMargin:'300px 0px'});
function observeSlots(){
  nearModels.disconnect();
  for(const slot of slots())nearModels.observe(slot);
}

function cancelDetails() {
  for (const animation of detailAnimations) animation.cancel();
  detailAnimations.clear();
}

function prepareDetails() {
  if (!isProject() || mobile.matches || svg().querySelector('[data-detail-group]')) return;
  const root = svg();
  const split = root.viewBox.baseVal.x + 520;
  const belowHero = root.viewBox.baseVal.y + 560;
  // Keep the existing art and its clipping hierarchy. Group whole drawable siblings
  // by column so the tab, background, captions and images all travel together.
  function groupChildren(parent) {
    const columns = [[], []];
    for (const child of [...parent.children]) {
      const tag = child.tagName.toLowerCase();
      if (!['g','path','rect','image','foreignobject'].includes(tag) || child.classList.contains('desktop-links')) continue;
      const bounds = child.getBBox();
      if (bounds.y >= belowHero && bounds.width > 0 && bounds.height > 0) {
        columns[bounds.x + bounds.width / 2 < split ? 0 : 1].push(child);
      } else if (tag === 'g') groupChildren(child);
    }
    columns.forEach((children, column) => {
      if (!children.length) return;
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.dataset.detailGroup = column === 0 ? 'renders' : 'process';
      parent.insertBefore(group, children[0]);
      for (const child of children) group.append(child);
    });
  }
  groupChildren(root);
}

function enterDetails() {
  if (!isProject() || mobile.matches || reducedMotion.matches) return;
  const scale = svg().getBoundingClientRect().width / svg().viewBox.baseVal.width;
  for (const group of svg().querySelectorAll('[data-detail-group]')) {
    const rect = group.getBoundingClientRect();
    const distance = Math.max(180, (innerHeight - rect.top + 80) / scale);
    const animation = animateDetails(group, distance, group.dataset.detailGroup === 'process' ? 1 : 0);
    detailAnimations.add(animation);
    animation.finished.then(() => {
      detailAnimations.delete(animation);
      animation.cancel();
    }, () => { detailAnimations.delete(animation); });
  }
}

function scheduleLayout() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; layout(); });
}

function sectionY(hash) {
  return hash === '#contact' ? (home() && mobile.matches ? 3740 : 2670)
    : hash === '#work' ? (home() ? (mobile.matches ? 535 : 634) : 0) : 0;
}

function scrollToSection(hash, smooth = true) {
  const contact = hash === '#contact' || hash === '#enquiry' ? document.querySelector('#contact') : null;
  if (contact) {
    const top = contact.getBoundingClientRect().top + scrollY - (home() && mobile.matches ? 76 : 0);
    window.scrollTo({ top, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
    return;
  }
  const artwork=svg();
  const top = main.getBoundingClientRect().top + scrollY + sectionY(hash) * (artwork ? artwork.clientWidth / artwork.viewBox.baseVal.width : 1);
  window.scrollTo({ top, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
}

function openDestination(hash) {
  if (hash === '#enquiry') {
    history.pushState(null, '', '#contact');
    currentURL = location.href;
    scrollToSection('#contact');
    return;
  }
  const key = hash.slice(1);
  const destination = window.portfolioLinks[key];
  if (destination) { location.href = key === 'email' ? 'mailto:' + destination : destination; return; }
  document.querySelector('#dialog-title').textContent = key === 'email' ? 'Get in touch' : key === 'resume' ? 'CV' : 'Illustrations';
  document.querySelector('#dialog-message').textContent = key === 'email' ? 'Contact details will be available here soon.'
    : key === 'resume' ? 'The CV link will be available here soon.' : 'The illustrations collection will be available here soon.';
  document.querySelector('#link-dialog').showModal();
}

document.addEventListener('submit',async event=>{
  const contactForm=event.target.closest('#contact-form');
  if(!contactForm)return;
  event.preventDefault();
  const status=contactForm.querySelector('#contact-status');
  const button=contactForm.querySelector('[type="submit"]');
  const panel=contactForm.closest('.homepage-contact-panel');
  const defaultLabel=button.textContent;
  panel?.classList.add('contact-feedback');
  button.disabled=true;
  button.textContent='sending…';
  status.textContent='Sending…';
  status.hidden=false;
  try{
    const email=window.portfolioLinks?.email;
    if(!email)throw new Error('The contact address is not configured.');
    const response=await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email)}`,{
      method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify(Object.fromEntries(new FormData(contactForm))),
    });
    const result=await response.json();
    if(!response.ok || result.success===false || result.success==='false')throw new Error(result.message||'Message could not be sent.');
    contactForm.reset();
    status.textContent='Message sent. Thank you.';
    button.textContent='sent';
  }catch(error){
    status.textContent='Message could not be sent. Please try again.';
    button.textContent='retry';
  }finally{
    button.disabled=false;
    window.setTimeout(()=>{if(button.isConnected)button.textContent=defaultLabel;panel?.classList.remove('contact-feedback');},2600);
  }
});

function pageName(url) {
  const filename = new URL(url, location.href).pathname.split('/').pop();
  if (!filename || filename === 'index.html') return 'homepage';
  const name = filename.replace(/\.html$/, '');
  return name==='about' || Object.hasOwn(PROJECTS, name) ? name : null;
}

function fetchPage(url) {
  const key = new URL(url, location.href); key.hash = '';
  if (!pages.has(key.href)) {
    const pending = fetch(key.href).then(async response => {
      if (!response.ok) throw new Error(`Page returned ${response.status}`);
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (!doc.querySelector('main .design') && !doc.querySelector('main template.desktop-artwork')?.content.querySelector('.design')) throw new Error('Invalid portfolio page');
      return doc;
    }).catch(error => { pages.delete(key.href); throw error; });
    pages.set(key.href, pending);
  }
  return pages.get(key.href);
}

function panel(project, type) {
  const root = !home() && project!==document.body.dataset.page ? main.querySelector('.next-project') : projectRoot();
  const layout = !home() && project!==document.body.dataset.page ? 'preview' : layoutName();
  return [...root.querySelectorAll(`[data-panel="${project}-${type}"]`)].find(element => element.dataset.layout === layout);
}

function panelColor(project,type){
  const element=panel(project,type);
  return element?.getAttribute('fill') || (element && getComputedStyle(element).backgroundColor) || PROJECTS[project][type];
}

function measurePanel(project, type) {
  const element = panel(project, type);
  if (element) {
    const artwork=element.ownerSVGElement;
    const radius=artwork ? (parseFloat(element.getAttribute('rx')) || (type==='outer'?20:8))*artwork.getBoundingClientRect().width/artwork.viewBox.baseVal.width
      : parseFloat(getComputedStyle(element).borderRadius)||8;
    return { ...element.getBoundingClientRect().toJSON(), radius };
  }
  // Mobile card bounds follow the corresponding exported model frame.
  const slot = slots().find(item => item.dataset.modelSlot === project);
  const box = slot.getBoundingClientRect();
  const scale = svg().clientWidth / svg().viewBox.baseVal.width;
  return { left: box.left - 8 * scale, top: box.top - 12 * scale,
    width: box.width + 16 * scale, height: 740 * scale, radius: type === 'outer' ? 20 : 8 };
}

function makePanel(color, className) {
  const layer = document.createElement('div');
  layer.className = `transition-panel ${className}`;
  layer.style.background = color;
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  return layer;
}

function readPanelShape(project, type) {
  const element = panel(project, type);
  if (!element || element.tagName.toLowerCase() !== 'path') return null;
  return {...panelShape(element.getAttribute('d'), element.getBBox(),{topStep:element.dataset.panelShape==='top-step'}),
    stroke:element.getAttribute('stroke')||element.dataset.panelStroke,strokeWidth:element.getAttribute('stroke-width')};
}

function setPanelShape(layer, shape, reverse) {
  if (!shape) return;
  const ns = 'http://www.w3.org/2000/svg';
  const outline = document.createElementNS(ns, 'svg');
  outline.setAttribute('viewBox', '0 0 1 1');
  outline.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('fill', layer.style.backgroundColor);
  if(shape.stroke){
    path.setAttribute('stroke',shape.stroke);
    path.setAttribute('stroke-width',shape.strokeWidth||'1');
    path.setAttribute('vector-effect','non-scaling-stroke');
    outline.style.overflow='visible';
  }
  layer.style.background = 'transparent';
  const from = reverse ? shape.rectangle : shape.card;
  const to = reverse ? shape.card : shape.rectangle;
  path.setAttribute('d', from);
  outline.append(path); layer.append(outline);
  layer.morphShape = {from,to};
}

function freezeOutgoingPage() {
  const bounds = main.getBoundingClientRect();
  const backdrop = document.createElement('div');
  backdrop.className = 'transition-outgoing';
  backdrop.style.background = getComputedStyle(document.body).backgroundColor;
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.inert = true;
  // Reuse the outgoing DOM. A deep clone used to parse/copy every gallery and
  // bitmap reference just as the transition began, causing a long mobile stall.
  const copy = main;
  // The new body page changes phone-only selectors while this DOM is still
  // visible. Pin the outgoing layout before the destination can hide its SVG
  // or replace the native header with the destination's navigation.
  const displayNodes = [...copy.children, ...copy.querySelectorAll('[data-native-navigation]')];
  const displays = displayNodes.map(element => [element, getComputedStyle(element).display]);
  for (const [element, display] of displays) element.style.display = display;
  const placeholder=document.createElement('div');
  placeholder.className='transition-placeholder';
  placeholder.style.height=`${bounds.height}px`;
  main.replaceWith(placeholder);
  // Each exported SVG reuses IDs. Isolate the outgoing artboard's clip paths/masks.
  const ids = new Map();
  for (const element of copy.querySelectorAll('[id]')) {
    ids.set(element.id, `outgoing-${element.id}`);
    element.id = `outgoing-${element.id}`;
  }
  for (const element of copy.querySelectorAll('*')) for (const attr of [...element.attributes]) {
    const value = attr.value.replace(/url\(#([^)]*)\)/g, (match, id) => ids.has(id) ? `url(#${ids.get(id)})` : match);
    if (value !== attr.value) element.setAttribute(attr.name, value);
    if ((attr.localName === 'href') && attr.value.startsWith('#') && ids.has(attr.value.slice(1))) {
      element.setAttributeNS(attr.namespaceURI, attr.name, '#' + ids.get(attr.value.slice(1)));
    }
  }
  Object.assign(copy.style, { position: 'absolute', left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, maxWidth: 'none', margin: '0' });
  backdrop.append(copy);
  document.body.append(backdrop);
  return backdrop;
}

function replacePage(doc, name, scrollTop) {
  const replacement=document.importNode(doc.querySelector('main'),true);
  if(main.closest('.transition-outgoing'))document.querySelector('.transition-placeholder').replaceWith(replacement);
  else main.replaceWith(replacement);
  main = replacement;
  document.body.dataset.page = name;
  document.title = doc.title;
  document.body.style.setProperty('--page-background', ['homepage','about'].includes(name) ? '#F1F1F1' : PROJECTS[name].outer);
  observer.disconnect(); observer.observe(main);
  layout();
  observeSlots();
  prepareDetails();
  window.scrollTo({ top: scrollTop, behavior: 'instant' });
}

async function navigate(url, fromHistory = false) {
  if (busy) { if (fromHistory) pendingHistoryURL = url; return; }
  const destination = pageName(url);
  if (!destination) { location.href = url; return; }
  const origin = document.body.dataset.page;
  const project = destination === 'homepage' ? origin : destination;
  const reverse = destination === 'homepage';
  busy = true;
  activity.moving(true);
  document.body.classList.add('is-navigating');
  let outerLayer, innerLayer, outgoing, modelAnimation;
  let swapped = false;
  try {
    const doc = await fetchPage(url);
    cancelDetails();
    positionModels(null,project);
    if (home()) homeScroll = scrollY;
    const frame = viewers.get(project);
    const fromPreview = !reverse && !home() && main.querySelector('.next-project')?.dataset.nextProject===project;
    if(fromPreview)homeScroll=null;
    const canAnimate = !reducedMotion.matches && frame && typeof frame.animate === 'function' && (home() || reverse || fromPreview);
    const modelFrom = frame ? { ...frame.getBoundingClientRect().toJSON(), radius: parseFloat(getComputedStyle(frame).borderRadius) || 0 } : null;
    const outerFrom = canAnimate ? (reverse ? { left: 0, top: 0, width: innerWidth, height: innerHeight, radius: 0 } : measurePanel(project, 'outer')) : null;
    const innerFrom = canAnimate ? measurePanel(project, 'inner') : null;
    const outerColorFrom = canAnimate ? (reverse ? getComputedStyle(document.body).backgroundColor : panelColor(project, 'outer')) : null;
    const innerColorFrom = canAnimate ? panelColor(project, 'inner') : null;
    const outerShape = canAnimate && !reverse ? readPanelShape(project, 'outer') : null;
    const innerShape = canAnimate && !reverse ? readPanelShape(project, 'inner') : null;
    if (canAnimate) {
      outgoing = reverse ? null : freezeOutgoingPage();
      // Keep all visible models stationary behind the expanding panels.
      for (const other of viewers.values()) if (!other.hidden) {
        const box = other.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(other).borderRadius) || 0;
        other.style.position = 'fixed';
        Object.assign(other.style, frameStyle({ ...box.toJSON(), radius }));
      }
      frame.classList.add('is-morphing');
      frame.querySelector('model-viewer').setAttribute('loading', 'eager');
      outerLayer = makePanel(outerColorFrom, 'transition-outer');
      innerLayer = makePanel(innerColorFrom, 'transition-inner');
      document.body.classList.add('transition-covered');
      document.documentElement.classList.add('motion-locked');
      deck.inert = true;
    }
    const scrollTop = reverse ? (homeScroll ?? 0) : 0;
    replacePage(doc, destination, scrollTop);
    if (reverse && homeScroll === null && Object.hasOwn(PROJECTS,project)) {
      const target = slots().find(slot => slot.dataset.modelSlot === project);
      window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + scrollY - innerHeight * 0.15), behavior: 'instant' });
    }
    swapped = true;
    if (!fromHistory && !pendingHistoryURL) history.pushState({ portfolio: true }, '', url);
    currentURL = new URL(url, location.href).href;
    if (canAnimate) {
      const target = slots().find(slot => slot.dataset.modelSlot === project);
      const modelTo = { ...target.getBoundingClientRect().toJSON(), radius: slotRadius(target) };
      const outerTo = reverse ? measurePanel(project, 'outer') : { left: 0, top: 0, width: innerWidth, height: innerHeight, radius: 0 };
      const innerTo = measurePanel(project, 'inner');
      setPanelShape(outerLayer, reverse ? readPanelShape(project, 'outer') : outerShape, reverse);
      setPanelShape(innerLayer, reverse ? readPanelShape(project, 'inner') : innerShape, reverse);
      outerLayer.morphColor = {from:outerColorFrom, to:reverse ? panelColor(project, 'outer') : getComputedStyle(document.body).backgroundColor};
      innerLayer.morphColor = {from:innerColorFrom, to:panelColor(project, 'inner')};
      await animatePageChange({
        reverse, outgoing,
        revealDestination: () => document.body.classList.remove('transition-covered'),
        restoreOtherModels: () => positionModels(project),
        startMotion: async () => {
          const outerAnimation = animatePanel(outerLayer, outerFrom, outerTo);
          const innerAnimation = animatePanel(innerLayer, innerFrom, innerTo, { delay: 40, duration: 960 });
          modelAnimation = animateModel(frame, modelFrom, modelTo, {stableSurface:mobile.matches});
          const animations = [outerAnimation, innerAnimation, modelAnimation];
          // Dissolve the reverse masks while they finish moving, avoiding a pause
          // and a second, visibly separate handoff at the destination tile.
          if (reverse) for (const layer of [outerLayer, innerLayer]) animations.push(
            layer.animate([{opacity:1},{opacity:0}], {delay:DURATION - 160,duration:160,fill:'both'})
          );
          await Promise.all(animations.map(animation => animation.finished));
        },
      });
      if (!reverse) {
        for (const [id, other] of viewers) other.hidden = id !== project;
        enterDetails();
        await Promise.all([outerLayer, innerLayer].map(layer => layer.animate([{opacity:1},{opacity:0}], {duration:140,fill:'forwards'}).finished));
      }
      Object.assign(frame.style, frameStyle({ ...modelTo, top: modelTo.top + scrollY }));
      frame.style.position = 'absolute';
      modelAnimation.cancel();
    } else enterDetails();
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    const hash = new URL(url, location.href).hash;
    if (['#enquiry', '#illustrations', '#resume'].includes(hash)) openDestination(hash);
  } catch (error) {
    console.error('Portfolio navigation failed:', error);
    if (!swapped) location.href = url;
  } finally {
    modelAnimation?.cancel();
    outgoing?.remove();
    outerLayer?.remove(); innerLayer?.remove();
    for (const frame of viewers.values()) frame.classList.remove('is-morphing');
    document.body.classList.remove('transition-covered', 'is-navigating');
    document.documentElement.classList.remove('motion-locked');
    deck.inert = false;
    busy = false;
    activity.moving(false);
    layout();
    if (!pendingHistoryURL && home() && new URL(url, location.href).hash === '#contact') {
      scrollToSection('#contact');
    }
    if (pendingHistoryURL) {
      const pending = pendingHistoryURL;
      pendingHistoryURL = null;
      navigate(pending, true);
    }
  }
}

document.addEventListener('click', event => {
  const anchor = event.target.closest('a');
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = anchor.getAttribute('href');
  if (!href) return;
  if (href.startsWith('#')) {
    event.preventDefault();
    if (['#enquiry', '#illustrations', '#resume'].includes(href)) openDestination(href);
    else { history.pushState(null, '', href); currentURL = location.href; scrollToSection(href); }
    return;
  }
  const url = new URL(href, location.href);
  if (url.origin !== location.origin || !pageName(url)) return;
  event.preventDefault();
  navigate(url.href);
});

for (const type of ['pointerover', 'focusin']) document.addEventListener(type, event => {
  if(event.pointerType==='touch' || (type==='pointerover' && mobile.matches))return;
  const anchor = event.target.closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (href && !href.startsWith('#') && pageName(href)) fetchPage(href).catch(() => {});
});
window.addEventListener('popstate', () => {
  if (busy) { pendingHistoryURL = location.href; return; }
  if (pageName(currentURL) === pageName(location.href)) { scrollToSection(location.hash); currentURL = location.href; }
  else navigate(location.href, true);
});
window.addEventListener('resize', scheduleLayout);
document.fonts?.addEventListener('loadingdone',()=>{
  syncPreviews(main,mobile.matches,true);
  scheduleLayout();
});
mobile.addEventListener('change', scheduleLayout);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) cancelDetails();
});
customElements.whenDefined('model-viewer').then(()=>{
  const Viewer=customElements.get('model-viewer');
  const setRenderBudget=()=>{Viewer.minimumRenderScale=mobile.matches?0.25:0.5;};
  setRenderBudget();mobile.addEventListener('change',setRenderBudget);
});
const observer = new ResizeObserver(scheduleLayout);
observer.observe(main);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
layout();
observeSlots();
prepareDetails();
enterDetails();
if (location.hash) requestAnimationFrame(() => {
  if (['#enquiry', '#illustrations', '#resume'].includes(location.hash)) openDestination(location.hash);
  else scrollToSection(location.hash, false);
});
