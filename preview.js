const K=0.55228475;
const n=value=>Number(value.toFixed(5));

// The reference's top-left raised label, including its concave attachment.
export function steppedOutline(x,y,width,height,tabWidth,tabHeight,r=8,c=8,bottomStepX=null,bottomStepHeight=0){
  const right=x+width,bottom=y+height,tab=x+tabWidth,shoulder=y+tabHeight;
  const shelf=bottom-bottomStepHeight;
  const lower=bottomStepX===null?'':`H${n(bottomStepX+c)}C${n(bottomStepX+c-c*K)} ${n(shelf)} ${n(bottomStepX)} ${n(shelf+c-c*K)} ${n(bottomStepX)} ${n(shelf+c)}V${n(bottom-r)}C${n(bottomStepX)} ${n(bottom-r+r*K)} ${n(bottomStepX-r+r*K)} ${n(bottom)} ${n(bottomStepX-r)} ${n(bottom)}`;
  return `M${n(tab)} ${n(shoulder-c)}C${n(tab)} ${n(shoulder-c+c*K)} ${n(tab+c-c*K)} ${n(shoulder)} ${n(tab+c)} ${n(shoulder)}H${n(right-r)}C${n(right-r+r*K)} ${n(shoulder)} ${n(right)} ${n(shoulder+r-r*K)} ${n(right)} ${n(shoulder+r)}V${n(shelf-r)}C${n(right)} ${n(shelf-r+r*K)} ${n(right-r+r*K)} ${n(shelf)} ${n(right-r)} ${n(shelf)}${lower}H${n(x+r)}C${n(x+r-r*K)} ${n(bottom)} ${n(x)} ${n(bottom-r+r*K)} ${n(x)} ${n(bottom-r)}V${n(y+r)}C${n(x)} ${n(y+r-r*K)} ${n(x+r-r*K)} ${n(y)} ${n(x+r)} ${n(y)}H${n(tab-r)}C${n(tab-r+r*K)} ${n(y)} ${n(tab)} ${n(y+r-r*K)} ${n(tab)} ${n(y+r)}V${n(shoulder-c)}Z`;
}

export function previewGeometry(width,height,ratio,mobile=false,descriptionHeight=0,summaryLength=0,titleHeight=20,measuredSummaryHeight=null){
  const scale=mobile?1:width/1261;
  const inset=(mobile?6:12)*scale,tabWidth=mobile?104:149*scale,tabHeight=mobile?28:48.15*scale;
  const padding=(mobile?16:14)*scale;
  const left=inset+padding,top=inset+tabHeight+padding;
  const modelWidth=mobile?width-2*left:464*scale;
  const modelHeight=modelWidth*263/464;
  const copyLeft=mobile?left:498*scale;
  const titleTop=mobile?top+modelHeight+14:top;
  const descriptionTop=mobile?titleTop+titleHeight+14:126*scale;
  const summaryHeight=measuredSummaryHeight??Math.ceil(summaryLength*6.82/modelWidth)*16;
  const yearTop=mobile?descriptionTop+summaryHeight+20:Math.max(211*scale,descriptionTop+descriptionHeight*scale+16*scale);
  const buttonWidth=mobile?Math.min(200,modelWidth-24):230*scale,buttonHeight=(mobile?48:58)*scale;
  if(mobile)height=Math.max(480,yearTop+14+24+buttonHeight+inset+padding);
  const buttonTop=(mobile?height-inset-padding:top+modelHeight)-buttonHeight;
  const stepX=copyLeft+buttonWidth+12*scale,stepHeight=44*scale;
  const labelWidth=mobile?42:31.596*scale;
  return {
    height,outer:steppedOutline(0,0,width,height,tabWidth+2*inset,tabHeight,14*scale,2*scale,stepX+inset,stepHeight),
    inner:steppedOutline(inset,inset,width-2*inset,height-2*inset,tabWidth,tabHeight,8*scale,8*scale,stepX,stepHeight),
    model:{x:left,y:top,width:modelWidth,height:modelHeight},
    label:{left:inset+(tabWidth-labelWidth)/2,top:inset+tabHeight*.58-labelWidth*9.02/31.596/2,width:labelWidth},
    copyLeft,titleTop,descriptionTop,yearTop,buttonTop,buttonWidth,buttonHeight,
    tabWidth,tabHeight,copyTop:top,padding:inset+padding,radius:8*scale,scale,inset,stepX,stepHeight,
  };
}

const sizes=new WeakMap();
export function syncPreviews(root,mobile,force=false){
  for(const card of root.querySelectorAll('.next-project-card')){
    const box=card.getBoundingClientRect();
    if(!box.width||!box.height)continue;
    const signature=`${box.width}:${box.height}:${mobile}`;
    if(!force&&sizes.get(card)===signature)continue;
    sizes.set(card,signature);
    const [w,h]=card.dataset.modelRatio.split('/').map(Number);
    let geometry=previewGeometry(box.width,box.height,w/h,mobile,Number(card.dataset.descriptionHeight)||0,Number(card.dataset.summaryLength)||0);
    if(mobile){
      // Give wrapping text its final column width before measuring its height.
      card.style.setProperty('--next-copy-left',`${geometry.copyLeft}px`);
      card.style.setProperty('--next-padding',`${geometry.padding}px`);
      const titleHeight=card.querySelector('.next-project-title-mobile')?.getBoundingClientRect?.().height||20;
      const summaryHeight=card.querySelector('.next-project-summary')?.getBoundingClientRect?.().height||null;
      geometry=previewGeometry(box.width,box.height,w/h,true,Number(card.dataset.descriptionHeight)||0,Number(card.dataset.summaryLength)||0,titleHeight,summaryHeight);
      card.style.setProperty('--next-mobile-height',`${geometry.height}px`);
    }
    card.style.setProperty('--next-tab-width',`${geometry.tabWidth}px`);
    card.style.setProperty('--next-tab-height',`${geometry.tabHeight}px`);
    card.style.setProperty('--next-copy-top',`${geometry.copyTop}px`);
    card.style.setProperty('--next-padding',`${geometry.padding}px`);
    card.style.setProperty('--next-scale',geometry.scale);
    for(const key of ['copyLeft','titleTop','descriptionTop','yearTop','buttonTop','buttonWidth','buttonHeight']){
      card.style.setProperty('--next-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),`${geometry[key]}px`);
    }
    for(const [key,value] of Object.entries(geometry.label))card.style.setProperty(`--next-label-${key}`,`${value}px`);
    card.querySelector('.next-project-shape').setAttribute('viewBox',`0 0 ${box.width} ${geometry.height}`);
    for(const type of ['outer','inner'])card.querySelector(`[data-panel$="-${type}"]`).setAttribute('d',geometry[type]);
    const model=card.querySelector('[data-model-slot]');
    for(const [key,value] of Object.entries(geometry.model))model.setAttribute(key,value);
    model.setAttribute('rx',geometry.radius);
    if(mobile){
      // Cache the browser's rounded CSS size, so fractional heights don't
      // trigger another layout on every unchanged observer callback.
      const settled=card.getBoundingClientRect();
      sizes.set(card,`${settled.width}:${settled.height}:${mobile}`);
    }
  }
}
