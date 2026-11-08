/**
 * Intent Router AXIAL. Reclamos y urgencias suben en prioridad;
 * insultos aislados no reciben prioridad automática.
 */
function normalize(question = "") {
 return String(question).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function classify(question = "") {
 const text = normalize(question);
 const urgent = ["urgente","emergencia","peligro","riesgo inmediato","amenaza","violencia","integridad fisica"];
 if (urgent.some(term => text.includes(term))) return {
  tipo:"urgencia", agente:"atencion_humana", confianza:0.98, prioridad:"critica", requiere_humano:true
 };
 const complaints = ["reclamo","queja","denuncia","problema","demora","incumplimiento","no me responden","maltrato","estafa","cobro indebido","solicito solucion"];
 if (complaints.some(term => text.includes(term))) return {
  tipo:"reclamo", agente:"atencion_humana", confianza:0.95, prioridad:"alta", requiere_humano:true
 };
 if (/\b(telefono|telefonos|numero|numeros|llamar|contactar|whatsapp)\b/.test(text))
  return {tipo:"orientacion",agente:"orientacion",confianza:0.95,prioridad:"normal",requiere_humano:false};
 if (/\b(dejar|enviar|mandar|hacer)\b.*\b(mensaje|consulta|pedido)\b/.test(text) || /\b(quiero hablar|quiero comunicarme|quiero contactar)\b/.test(text))
  return {tipo:"contacto",agente:"contacto",confianza:0.92,prioridad:"normal",requiere_humano:true};
 if (/\b(aprender|ensenar|formacion|formativo|historia parlamentaria|ciudadania|participar|participacion|compromiso civico)\b/.test(text))
  return {tipo:"formativa",agente:"formativo",confianza:0.90,prioridad:"normal",requiere_humano:false};
 if (/\b(horario|horarios|direccion|donde|como asociarme|asociarme|tramite|actividad|actividades|funciona|funcionan|reunion|reuniones)\b/.test(text))
  return {tipo:"operativa",agente:"operativo",confianza:0.88,prioridad:"normal",requiere_humano:false};
 return {tipo:"institucional",agente:"institucional",confianza:0.70,prioridad:"normal",requiere_humano:false};
}
module.exports = { classify };
