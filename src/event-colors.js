export const EVENT_COLORS = Object.freeze({buy:[.22,1,.48],sell:[1,.22,.26],fee:[1,.32,.75]});
export function eventColor(side){return EVENT_COLORS[side] || [.72,.79,.86];}

export function writeStimulusTags(colors,times,cells,side,now){
  const rgb=eventColor(side);
  for(const i of cells){if(!Number.isInteger(i)||i<0||i>=times.length)continue;colors.set(rgb,i*3);times[i]=now;}
}
