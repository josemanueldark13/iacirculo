function envFirst(...names) {
 for (const name of names) {
  const value = process.env[name]?.trim();
  if (value) return value;
 }
 return null;
}
function isConfigured() {
 return Boolean(envFirst("FACEBOOK_PAGE_ACCESS_TOKEN","META_PAGE_ACCESS_TOKEN"));
}
async function sendApprovedMessage(recipientId,text) {
 const token = envFirst("FACEBOOK_PAGE_ACCESS_TOKEN","META_PAGE_ACCESS_TOKEN");
 if (!token) {
  const error = new Error("Falta FACEBOOK_PAGE_ACCESS_TOKEN.");
  error.code = "MESSENGER_NOT_CONFIGURED";
  throw error;
 }
 const version = envFirst("META_GRAPH_VERSION") || "v23.0";
 const response = await fetch(`https://graph.facebook.com/${version}/me/messages`,{
  method:"POST",
  signal:AbortSignal.timeout(15000),
  headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
  body:JSON.stringify({
   recipient:{id:recipientId},
   messaging_type:"RESPONSE",
   message:{text:String(text).slice(0,2000)}
  })
 });
 let payload = {};
 try { payload = await response.json(); } catch { /* Do not expose provider response bodies. */ }
 if (!response.ok) {
  const error = new Error("Messenger rechazó el envío aprobado.");
  error.code = "MESSENGER_SEND_FAILED";
  error.providerCode = payload?.error?.code || null;
  throw error;
 }
 return {recipientId:payload?.recipient_id || recipientId,messageId:payload?.message_id || null};
}
module.exports = {isConfigured,sendApprovedMessage};
