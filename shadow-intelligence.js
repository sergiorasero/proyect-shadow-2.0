/* SHADOW INTELLIGENCE — motor local, gratuito y adaptable.
 * No usa servicios externos. Analiza objetivos, carga e historial del jugador.
 */
(function(global){
  "use strict";
  const DAY=86400000;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const text=v=>String(v??"").trim();
  const categoryOf=value=>{
    const x=text(value).toLowerCase();
    if(/estud|aprend|clase|examen|neum|ingl|electric|metrolog|formaci/.test(x))return "study";
    if(/proyecto|tecnolog|program|app|c[oó]digo|shadow|crear/.test(x))return "project";
    if(/entren|f[ií]sic|deport|movilidad|recuper/.test(x))return "wellbeing";
    if(/organiz|h[aá]bito|disciplina|personal|rutina|desarroll/.test(x))return "habit";
    return "general";
  };
  const templates={
    study:[["Recuerdo activo","Repasa {goal} y escribe tres ideas clave sin consultar los apuntes."],["Práctica enfocada","Completa una actividad breve de {goal} y revisa el resultado."],["Bloque de aprendizaje","Dedica un bloque manejable a {goal} y anota qué has comprendido."]],
    project:[["Avance concreto","Elige una mejora pequeña de {goal}, complétala y registra el resultado."],["Desbloquear el proyecto","Identifica el siguiente obstáculo de {goal} y define una acción viable."],["Plan de desarrollo","Divide {goal} en tres pasos y completa el primero."]],
    wellbeing:[["Bienestar equilibrado","Sigue el plan saludable previsto: actividad adecuada si corresponde o recuperación si la necesitas."],["Revisión de recuperación","Comprueba cómo te encuentras y adapta la actividad prevista a tu energía y descanso."]],
    habit:[["Acción sostenible","Dedica un momento realista a {goal} y registra el avance."],["Preparar el entorno","Organiza un aspecto concreto que facilite {goal}."],["Revisión de hábitos","Evalúa {goal} y elige una mejora pequeña para esta semana."]],
    general:[["Paso medible","Define un resultado pequeño para {goal} y da el siguiente paso."],["Revisión de progreso","Revisa {goal}, identifica qué falta y realiza una acción breve."]]
  };
  function analyze(state,now=Date.now()){
    const goals=(Array.isArray(state.objectives)?state.objectives:[]).map(text).filter(Boolean);
    const missions=Array.isArray(state.missions)?state.missions:[];
    const history=Array.isArray(state.history)?state.history:[];
    const active=missions.filter(m=>!m.done&&!m.paused&&Number(m.dueAt)>now);
    const recent=history.filter(h=>h&&h.date&&now-new Date(h.date).getTime()<=14*DAY&&Number.isFinite(new Date(h.date).getTime()));
    const completed=recent.filter(h=>Number(h.xp)>0&&h.kind!=="boss").length;
    const missed=(Array.isArray(state.archive)?state.archive:[]).filter(m=>m.status==="expired"&&now-(m.archivedAt||0)<=14*DAY).length;
    const load=active.length;
    const completionRate=(completed+missed) ? completed/(completed+missed) : 0.7;
    const capacity=load>=8?"low":load>=5?"medium":"normal";
    const trend=completionRate>=0.8?"positive":completionRate<0.45?"needs-support":"steady";
    return {goals,activeCount:load,completedRecent:completed,missedRecent:missed,completionRate,capacity,trend,analysedAt:now};
  }
  function priority(goal,index,analysis,period){
    const category=categoryOf(goal);
    const importance=category==="study"?0.88:category==="project"?0.82:category==="wellbeing"?0.78:0.68;
    const urgency=period==="daily"?0.9:period==="weekly"?0.68:0.45;
    const progressNeed=analysis.trend==="needs-support"?0.72:analysis.trend==="positive"?0.48:0.6;
    const loadFactor=analysis.capacity==="low"?0.55:analysis.capacity==="medium"?0.78:1;
    const score=Math.round((importance*0.35+urgency*0.25+progressNeed*0.2+(index===0?0.9:0.6)*0.1+loadFactor*0.1)*100);
    return {score,importance:Math.round(importance*100),urgency:Math.round(urgency*100)};
  }
  function difficulty(goal,analysis){
    let level=/examen|entrega|presentaci|proyecto final/i.test(goal)?3:2;
    if(analysis.trend==="needs-support")level=Math.max(1,level-1);
    if(analysis.capacity!=="normal")level=1;
    if(analysis.trend==="positive"&&analysis.capacity==="normal")level=Math.min(3,level+0);
    return level;
  }
  function create(state,period,key,now=Date.now()){
    const a=analyze(state,now);
    const goals=a.goals.length?a.goals:["Estudios y aprendizaje","Proyecto personal y tecnología","Organización y desarrollo personal"];
    const count=period==="daily"?5:period==="weekly"?2:1;
    const due=new Date(now);
    if(period==="daily")due.setHours(23,59,59,999);
    else if(period==="weekly"){const day=(due.getDay()+6)%7;due.setDate(due.getDate()+(6-day));due.setHours(23,59,59,999);}
    else {due.setMonth(due.getMonth()+1,0);due.setHours(23,59,59,999);}
    const result=[];
    for(let i=0;i<count;i++){
      const recovery=period==="daily"&&i===1;
      const goal=recovery?"Bienestar y recuperación":goals[(i+key.length)%goals.length];
      const cat=recovery?"wellbeing":categoryOf(goal);
      const options=templates[cat]||templates.general;
      const template=options[(i+key.length)%options.length];
      const p=priority(goal,i,a,period);
      const level=recovery?1:difficulty(goal,a);
      const xp=period==="daily"?[8,12,16][level-1]:period==="weekly"?[18,25,32][level-1]:[35,45,55][level-1];
      const title=recovery?template[0]:template[0];
      result.push({
        id:"si-"+period+"-"+key+"-"+i,
        title:recovery?title:template[0],
        description:recovery?template[1]:template[1].replaceAll("{goal}",goal),
        period,reward:xp,dueAt:due.getTime(),objective:goal,
        done:false,paused:false,penaltyApplied:false,createdAt:now,
        source:"shadow-intelligence",category:cat,difficultyLevel:level,
        difficultyLabel:["","Ligera","Normal","Avanzada"][level],
        priorityScore:p.score,importance:p.importance,urgency:p.urgency,
        estimatedMinutes:level===1?10:level===2?25:35,
        successCriteria:"Completa el paso acordado y registra el resultado. Puedes adaptarlo si cambian tus circunstancias.",
        reason:"Priorizada según objetivo, periodo, progreso reciente y carga activa."
      });
    }
    return result;
  }
  function sort(missions){
    return missions.slice().sort((a,b)=>(Number(b.priorityScore)||0)-(Number(a.priorityScore)||0)||Number(a.dueAt)-Number(b.dueAt));
  }
  function summary(state,now=Date.now()){
    const a=analyze(state,now);
    const trend=a.trend==="positive"?"Progreso constante":a.trend==="needs-support"?"Carga en revisión":"Ritmo estable";
    const capacity=a.capacity==="low"?"Carga alta: se priorizan pasos ligeros.":a.capacity==="medium"?"Carga moderada: se evita añadir complejidad.":"Carga equilibrada.";
    return {trend,capacity,active:a.activeCount,completed:a.completedRecent,missed:a.missedRecent};
  }
  global.ShadowIntelligence={version:"1.0.0",analyze,create,sort,summary};
})(window);
