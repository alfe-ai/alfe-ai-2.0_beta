[... existing code ...]
function updateSterlingUrlDisplay() {
  const tab = chatTabs.find(t => t.id === currentTabId);
  const lbl = $("#sterlingUrlLabel");
  if (tab && tab.sterling_url) {
    lbl.innerHTML = `Sterling chat: <a href="${tab.sterling_url}" target="_blank">${tab.sterling_url}</a>`;
  } else {
    lbl.innerHTML = "";
  }
}

function renderTabs(){
  const tc = $("#tabsContainer");
  tc.innerHTML="";
  chatTabs.forEach(tab => {
    const tabBtn = document.createElement("div");
    /* ... existing styling code ... */
    tc.appendChild(tabBtn);
  });
  updateSterlingUrlDisplay();   // NEW
}
[... existing code ...]

document.getElementById("createSterlingChatBtn").addEventListener("click", async () => {
  try {
    const resp = await fetch("/api/createSterlingChat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId: currentTabId })   // NEW
    });
    if(!resp.ok){
      alert("Error creating sterling chat");
      return;
    }
    const data = await resp.json();
    if (data.success && data.sterlingUrl) {
      // update cache & UI
      const idx = chatTabs.findIndex(t => t.id === currentTabId);
      if (idx !== -1) chatTabs[idx].sterling_url = data.sterlingUrl;
      updateSterlingUrlDisplay();
    }
  } catch(e) {
    console.error("CreateSterlingChat call failed:", e);
    alert("Error creating sterling chat");
  }
});
[... inside selectTab(tabId) add:]
function selectTab(tabId){
  currentTabId = tabId;
  loadChatHistory(tabId);
  renderTabs();
  updateSterlingUrlDisplay();   // ensure label refresh
}
[... in init() after renderTabs():]
  updateSterlingUrlDisplay();
[... rest of file unchanged ...]
