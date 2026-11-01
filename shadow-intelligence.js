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
  function learningFor(state,category){
    const records=state.intelligence&&Array.isArray(state.intelligence.outcomes)?state.intelligence.outcomes:[];
    const samples=records.filter(x=>x.category===category).slice(-20);
    const rate=samples.length?samples.filter(x=>x.success).length/samples.length:0.65;
    return {samples:samples.length,rate,adjustment:samples.length<4?0:rate>=0.8?1:rate<0.4?-1:0};
  }
  function difficulty(goal,analysis,state){
    const category=categoryOf(goal);
    const learned=learningFor(state,category);
    let level=/examen|entrega|presentaci|proyecto final/i.test(goal)?3:2;
    if(analysis.trend==="needs-support")level=Math.max(1,level-1);
    if(analysis.capacity!=="normal")level=1;
    if(learned.samples>=4)level=clamp(level+learned.adjustment,1,3);
    return level;
  }
  function learnOutcome(state,mission,success,now=Date.now()){
    if(!state.intelligence||typeof state.intelligence!=="object")state.intelligence={version:1,outcomes:[],adjustments:0};
    if(!Array.isArray(state.intelligence.outcomes))state.intelligence.outcomes=[];
    if(!mission||mission.learningRecorded)return false;
    const category=mission.category||categoryOf(mission.objective||mission.title);
    state.intelligence.outcomes.push({id:String(mission.id),category,success:!!success,difficulty:clamp(Number(mission.difficultyLevel)||2,1,3),period:mission.period||"custom",at:now});
    state.intelligence.outcomes=state.intelligence.outcomes.slice(-120);
    mission.learningRecorded=true;
    return true;
  }
  function learningSummary(state){
    const records=state.intelligence&&Array.isArray(state.intelligence.outcomes)?state.intelligence.outcomes:[];
    const categories=["study","project","habit","wellbeing","general"];
    return categories.map(category=>{
      const rows=records.filter(x=>x.category===category).slice(-20);
      const rate=rows.length?rows.filter(x=>x.success).length/rows.length:null;
      return {category,samples:rows.length,rate,adjustment:rows.length<4?0:rate>=0.8?1:rate<0.4?-1:0};
    });
  }
  function create(state,period,key,now=Date.now()){
    const a=analyze(state,now);
    const goals=a.goals.length?a.goals:["Estudios y aprendizaje","Proyecto personal y tecnología","Organización y desarrollo personal"];
    const count=period==="daily"?(a.activeCount>=5?2:a.activeCount>=3?3:5):period==="weekly"?(a.activeCount>=5?1:2):1;
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
      const level=recovery?1:difficulty(goal,a,state);
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

  function predict(state,now=Date.now()){
    const missions=Array.isArray(state.missions)?state.missions:[];
    const goals=(Array.isArray(state.objectives)?state.objectives:[]).map(text).filter(Boolean);
    const active=missions.filter(m=>!m.done&&!m.paused&&Number(m.dueAt)>now);
    const next7=active.filter(m=>Number(m.dueAt)<=now+7*DAY);
    const byDay={};
    for(let i=0;i<7;i++){const d=new Date(now+i*DAY);const key=d.toISOString().slice(0,10);byDay[key]=next7.filter(m=>new Date(m.dueAt).toISOString().slice(0,10)===key).length;}
    const peak=Math.max(0,...Object.values(byDay));
    const outcomes=state.intelligence&&Array.isArray(state.intelligence.outcomes)?state.intelligence.outcomes:[];
    const doneByGoal={};
    for(const h of (Array.isArray(state.history)?state.history:[])){
      if(h&&h.objective&&h.kind==="mission"&&h.date){const t=new Date(h.date).getTime();if(Number.isFinite(t))doneByGoal[h.objective]=Math.max(doneByGoal[h.objective]||0,t);}
    }
    for(const m of (Array.isArray(state.archive)?state.archive:[])){
      if(m&&m.status==="completed"&&m.objective){doneByGoal[m.objective]=Math.max(doneByGoal[m.objective]||0,Number(m.archivedAt)||0);}
    }
    const stalled=goals.filter(g=>!doneByGoal[g]||now-doneByGoal[g]>=14*DAY).map(g=>({goal:g,lastProgressAt:doneByGoal[g]||null,daysSince:doneByGoal[g]?Math.floor((now-doneByGoal[g])/DAY):null}));
    const risk=active.length>=8||peak>=4?"high":active.length>=5||peak>=3?"medium":"low";
    const recommendations=[];
    if(risk==="high")recommendations.push("Carga alta prevista: se generarán menos misiones nuevas y se priorizarán pasos breves.");
    else if(risk==="medium")recommendations.push("Carga moderada: mantén las prioridades principales y evita añadir retos opcionales.");
    else recommendations.push("Carga prevista equilibrada para los próximos días.");
    if(stalled.length)recommendations.push("Hay objetivos sin progreso registrado recientemente: reserva un paso pequeño y concreto para uno de ellos.");
    if(outcomes.length<4)recommendations.push("El aprendizaje está recopilando datos; las recomendaciones serán más precisas al registrar más resultados.");
    return {risk,active:active.length,next7:next7.length,peakDaily:peak,byDay,stalled,recommendations};
  }
  function rebalance(state,now=Date.now()){
    const forecast=predict(state,now);
    const stalledSet=new Set(forecast.stalled.map(x=>x.goal));
    const active=(Array.isArray(state.missions)?state.missions:[]).filter(m=>!m.done&&!m.paused&&Number(m.dueAt)>now);
    active.forEach(m=>{
      const remaining=Math.max(0,Number(m.dueAt)-now);
      const urgency=remaining<=DAY?1:remaining<=3*DAY?0.8:remaining<=7*DAY?0.6:0.35;
      const goal=m.objective||"";
      const progressNeed=stalledSet.has(goal)?0.95:0.55;
      const loadPenalty=forecast.risk==="high"?0.25:forecast.risk==="medium"?0.12:0;
      const importance=m.category==="study"?0.88:m.category==="project"?0.82:0.68;
      m.priorityScore=Math.round(clamp((importance*0.35+urgency*0.3+progressNeed*0.25+(1-loadPenalty)*0.1)*100,1,100));
      m.reason=stalledSet.has(goal)?"Prioridad elevada: objetivo sin progreso reciente.":"Prioridad recalculada según plazo y carga prevista.";
    });
    if(!state.intelligence||typeof state.intelligence!=="object")state.intelligence={version:1,outcomes:[],adjustments:0};
    state.intelligence.lastRebalanceAt=now;
    state.intelligence.adjustments=(Number(state.intelligence.adjustments)||0)+1;
    return {forecast,updated:active.length};
  }
  function sort(missions){
    return missions.slice().sort((a,b)=>(Number(b.priorityScore)||0)-(Number(a.priorityScore)||0)||Number(a.dueAt)-Number(b.dueAt));
  }
  function summary(state,now=Date.now()){
    const a=analyze(state,now);
    const trend=a.trend==="positive"?"Progreso constante":a.trend==="needs-support"?"Carga en revisión":"Ritmo estable";
    const capacity=a.capacity==="low"?"Carga alta: se priorizan pasos ligeros.":a.capacity==="medium"?"Carga moderada: se evita añadir complejidad.":"Carga equilibrada.";
    const learned=learningSummary(state);const sampleCount=learned.reduce((n,x)=>n+x.samples,0);return {trend,capacity,active:a.activeCount,completed:a.completedRecent,missed:a.missedRecent,learningSamples:sampleCount,learning:learned};
  }
  global.ShadowIntelligence={version:"1.2.0",analyze,create,sort,summary,learnOutcome,learningSummary,predict,rebalance};
})(window);
