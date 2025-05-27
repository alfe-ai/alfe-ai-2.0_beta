function getCookie(name){
  const match = document.cookie.split('; ').find(row => row.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}
function setCookie(name, value, days=365){
  const expires = new Date(Date.now() + days*864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}
function getSessionId(){
  let id = getCookie('sessionId') || sessionStorage.getItem('sessionId');
  if(!id) id = crypto.randomUUID();
  sessionStorage.setItem('sessionId', id);
  setCookie('sessionId', id);
  return id;
}
const sessionId = getSessionId();
