/* Moved script logic from index.html to main.js */
let columnsOrder = [
  { key: "drag",         label: "⠿"          },
  { key: "priority",     label: "Prio"       },
  { key: "status",       label: "Status"     },
  { key: "number",       label: "#"          },
  { key: "title",        label: "Title"      },
  { key: "dependencies", label: "Depends On" },
  { key: "project",      label: "Project"    },
  { key: "created",      label: "Created"    }
];
let visibleCols = new Set(columnsOrder.map(c => c.key));
let allTasks = [];
let dragSrcRow = null;
let modelName = "unknown";
let tasksVisible = true;
let sidebarVisible = true;
let chatTabs = [];
let currentTabId = 1;
let chatHideMetadata = false;
let chatTabAutoNaming = false;
let showSubbubbleToken = false;
window.agentName = "Alfe";

const defaultFavicon = "alfe_favicon_clean_64x64.ico";
const rotatingFavicon = "alfe_favicon_clean_64x64.ico";
let favElement = null;

const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];

function formatTimestamp(isoStr){
  if(!isoStr) return "(no time)";
  const d = new Date(isoStr);
  return d.toLocaleString([], {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function isoDate(d) {
  return new Date(d).toLocaleDateString([], {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  });
}

function showModal(m){ m.style.display = "flex"; }
function hideModal(m){ m.style.display = "none"; }
$$(".modal").forEach(m => m.addEventListener("click", e => { if(e.target===m) hideModal(m); }));

async function toggleTasks(){
  tasksVisible = !tasksVisible;
  $("#tasks").style.display = tasksVisible ? "" : "none";
  $("#toggleTasksBtn").textContent = tasksVisible ? "Hide tasks" : "Show tasks";
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "tasks_visible", value: tasksVisible })
  });
}
$("#toggleTasksBtn").addEventListener("click", toggleTasks);

async function toggleSidebar(){
  sidebarVisible = !sidebarVisible;
  const sidebarEl = $(".sidebar");
  const dividerEl = $("#divider");
  sidebarEl.style.display = sidebarVisible ? "" : "none";
  dividerEl.style.display = sidebarVisible ? "" : "none";
  $("#toggleSidebarBtn").textContent = sidebarVisible ? "Hide sidebar" : "Show sidebar";

  const expandBtn = document.getElementById("expandSidebarBtn");
  expandBtn.style.display = sidebarVisible ? "none" : "block";

  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "sidebar_visible", value: sidebarVisible })
  });
}
$("#toggleSidebarBtn").addEventListener("click", toggleSidebar);

document.getElementById("expandSidebarBtn").addEventListener("click", () => {
  if(!sidebarVisible) {
    toggleSidebar();
  }
});

async function loadSettings(){
  {
    const r = await fetch("/api/settings/visible_columns");
    if(r.ok){
      const { value } = await r.json();
      if(Array.isArray(value)){ visibleCols = new Set(value); }
    }
  }
  {
    const r = await fetch("/api/settings/columns_order");
    if(r.ok){
      const { value } = await r.json();
      if(Array.isArray(value)){
        const map = Object.fromEntries(columnsOrder.map(c=>[c.key,c]));
        const newOrd = [];
        value.forEach(k => { if(map[k]){ newOrd.push(map[k]); delete map[k]; }});
        Object.values(map).forEach(c => newOrd.push(c));
        columnsOrder = newOrd;
      }
    }
  }
  {
    const r = await fetch("/api/settings/tasks_visible");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== "undefined"){
        tasksVisible = !!value;
      }
    }
    $("#tasks").style.display = tasksVisible ? "" : "none";
    $("#toggleTasksBtn").textContent = tasksVisible ? "Hide tasks" : "Show tasks";
  }
  {
    const r = await fetch("/api/settings/sidebar_visible");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== "undefined"){
        sidebarVisible = !!value;
      }
    }
    $(".sidebar").style.display = sidebarVisible ? "" : "none";
    $("#divider").style.display = sidebarVisible ? "" : "none";
    $("#toggleSidebarBtn").textContent = sidebarVisible ? "Hide sidebar" : "Show sidebar";
    document.getElementById("expandSidebarBtn").style.display = sidebarVisible ? "none" : "block";
  }
  {
    const r = await fetch("/api/settings/sidebar_width");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== 'undefined'){
        $(".sidebar").style.width = value + "px";
      }
    }
  }
}
async function saveSettings(){
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ key:"visible_columns", value:[...visibleCols] })
  });
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ key:"columns_order", value:columnsOrder.map(c=>c.key) })
  });
}

function renderHeader(){
  const tr = $("#headerRow");
  tr.innerHTML = "";
  columnsOrder.forEach(col => {
    if(!visibleCols.has(col.key)) return;
    const th = document.createElement("th");
    th.textContent = col.label;
    tr.appendChild(th);
  });
}

function handleDragStart(e){
  dragSrcRow = e.target.closest("tr");
  e.dataTransfer.effectAllowed = "move";
}
function handleDragOver(e){
  if(dragSrcRow && e.currentTarget !== dragSrcRow){
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    e.currentTarget.classList.add("drag-over");
  }
}
function handleDragLeave(e){
  e.currentTarget.classList.remove("drag-over");
}
function handleDrop(e){
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove("drag-over");
  if(dragSrcRow && dragSrcRow !== target){
    const tbody = target.parentNode;
    const rows = [...tbody.children];
    let from = rows.indexOf(dragSrcRow);
    let to = rows.indexOf(target);
    tbody.removeChild(dragSrcRow);
    if(from < to) to--;
    tbody.insertBefore(dragSrcRow, tbody.children[to]);
    saveNewOrderToServer();
  }
  dragSrcRow = null;
}
function handleDragEnd(){
  $$(`tr.drag-over`).forEach(r=>r.classList.remove("drag-over"));
  dragSrcRow = null;
}
async function saveNewOrderToServer(){
  const ids = $$("#tasks tbody tr").map(r=>+r.dataset.taskId);
  await fetch("/api/tasks/reorderAll",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ orderedIds: ids })
  });
}

async function fetchTasks(){
  const inc = $("#showHidden").checked;
  const res = await fetch(`/api/tasks?includeHidden=${inc?1:0}`);
  return res.json();
}

function renderBody(){
  const tbody = $("#tasks tbody");
  tbody.innerHTML = "";
  const pj = $("#projectFilter").value;
  const sp = $("#sprintFilter").value;
  allTasks
    .filter(t=>{
      if(pj && t.project!==pj) return false;
      if(sp && t.sprint!==sp) return false;
      return true;
    })
    .forEach(t=>{
      const tr = document.createElement("tr");
      tr.dataset.taskId = t.id;
      if(t.hidden) tr.classList.add("hidden");
      [
        "drag","priority","status","number","title",
        "dependencies","project","created"
      ].forEach(key=>{
        if(!visibleCols.has(key)) return;
        const td = document.createElement("td");
        switch(key){
          case "drag":
            td.innerHTML = `<span class="drag-handle" draggable="true">⠿</span>`;
            td.querySelector(".drag-handle").addEventListener("dragstart", handleDragStart);
            break;
          case "priority":
            td.textContent = t.priority;
            td.className="priority-cell";
            break;
          case "status":
            td.textContent = t.status;
            td.className="status-cell";
            break;
          case "number":
            td.innerHTML = `<a href="${t.html_url}" target="_blank">#${t.number}</a>`;
            break;
          case "title":
            td.textContent = t.title;
            td.className="title-cell";
            break;
          case "dependencies":
            td.textContent = t.dependencies;
            td.className="dependencies-cell";
            break;
          case "project":
            td.textContent = t.project;
            td.className="project-cell";
            break;
          case "created":
            td.textContent = isoDate(t.created_at);
            break;
          default:
            td.textContent = t[key]||"";
        }
        tr.appendChild(td);
      });
      ["dragover","dragleave","drop","dragend"].forEach(evt=>{
        tr.addEventListener(evt, {
          "dragover":handleDragOver,
          "dragleave":handleDragLeave,
          "drop":handleDrop,
          "dragend":handleDragEnd
        }[evt]);
      });
      tbody.appendChild(tr);
    });
}

async function loadTasks(){
  allTasks = await fetchTasks();
  renderHeader();
  renderBody();
}

async function populateFilters(){
  const pj = await (await fetch("/api/projects")).json();
  $("#projectFilter").innerHTML = '<option value="">All projects</option>' +
    pj.map(p=>`<option value="${p.project}">${p.project}</option>`).join("");
  const sp = await (await fetch("/api/sprints')).json();
  $("#sprintFilter").innerHTML = '<option value="">All sprints</option>' +
    sp.map(s=>`<option value="${s.sprint}">${s.sprint}</option>`).join("");
}

// ... [unchanged task table code] ...

function addChatMessage(pairId, userText, userTs, aiText, aiTs, model, systemContext, fullHistory, tokenInfo) {
  // parse tokenInfo once
  let tInfo = {};
  if (tokenInfo) {
    try { tInfo = JSON.parse(tokenInfo); }
    catch(e) { tInfo = {}; }
  }

  const seqDiv = document.createElement("div");
  seqDiv.className = "chat-sequence";

  const userDiv = document.createElement("div");
  userDiv.className = "chat-user";
  {
    const userHead = document.createElement("div");
    userHead.className = "bubble-header";
    userHead.innerHTML = `
      <div class="name-oval name-oval-user">User</div>
      <span style="opacity:0.8;">${formatTimestamp(userTs)}</span>
    `;
    userDiv.appendChild(userHead);

    const userBody = document.createElement("div");
    userBody.textContent = userText;
    userDiv.appendChild(userBody);

    if(showSubbubbleToken && tokenInfo) {
      const inTokens = tInfo.inputTokens || 0;
      const userTokDiv = document.createElement("div");
      userTokDiv.className = "token-indicator";
      userTokDiv.textContent = `In: ${inTokens}`;
      userDiv.appendChild(userTokDiv);
    }
  }
  seqDiv.appendChild(userDiv);

  const botDiv = document.createElement("div");
  botDiv.className = "chat-bot";

  const botHead = document.createElement("div");
  botHead.className = "bubble-header";
  botHead.innerHTML = `
    <div class="name-oval name-oval-ai">${window.agentName} (${model || ""})</div>
    <span style="opacity:0.8;">${aiTs ? formatTimestamp(aiTs) : "…"}</span>
  `;
  botDiv.appendChild(botHead);

  const botBody = document.createElement("div");
  botBody.textContent = aiText || "";
  botDiv.appendChild(botBody);

  if(showSubbubbleToken && tokenInfo) {
    const outTokens = tInfo.finalAssistantTokens || 0;
    const botTokDiv = document.createElement("div");
    botTokDiv.className = "token-indicator";
    botTokDiv.textContent = `Out: ${outTokens}`;
    botDiv.appendChild(botTokDiv);
  }

  seqDiv.appendChild(botDiv);

  if(!chatHideMetadata){
    const metaContainer = document.createElement("div");
    metaContainer.style.fontSize = "0.8rem";
    metaContainer.style.color = "#aaa";
    metaContainer.style.textAlign = "right";

    // Pair #
    const pairLabel = document.createElement("div");
    pairLabel.textContent = `Pair #${pairId}`;
    metaContainer.appendChild(pairLabel);

    // Model
    if (model) {
      const modelLabel = document.createElement("div");
      modelLabel.textContent = `Model: ${model}`;
      metaContainer.appendChild(modelLabel);
    }

    // System Context with token count
    if (systemContext) {
      const scDetails = document.createElement("details");
      const scSum = document.createElement("summary");
      const sysTok = tInfo.systemTokens || 0;
      scSum.textContent = `System Context (Tokens: ${sysTok})`;
      scDetails.appendChild(scSum);

      const lines = systemContext.split(/\r?\n/);
      lines.forEach(line => {
        if (!line.trim()) return;
        const lineBubble = document.createElement("div");
        lineBubble.className = "chat-bot";
        lineBubble.style.marginTop = "4px";
        lineBubble.textContent = line;
        scDetails.appendChild(lineBubble);
      });

      metaContainer.appendChild(scDetails);
    }

    // Full History with token count
    if(fullHistory) {
      const fhDetails = document.createElement("details");
      const fhSum = document.createElement("summary");
      const historyTok = (tInfo.historyTokens || 0) + (tInfo.assistantTokens || 0);
      fhSum.textContent = `Full History (Tokens: ${historyTok})`;
      fhDetails.appendChild(fhSum);

      const fhPre = document.createElement("pre");
      fhPre.textContent = JSON.stringify(fullHistory, null, 2);
      fhDetails.appendChild(fhPre);

      metaContainer.appendChild(fhDetails);
    }

    // Token Usage summary
    if(tokenInfo){
      const tokDetails = document.createElement("details");
      const tokSum = document.createElement("summary");
      const totalTok = tInfo.total || 0;
      tokSum.textContent = `Token Usage (Tokens: ${totalTok})`;
      tokDetails.appendChild(tokSum);

      const usageDiv = document.createElement("div");
      usageDiv.style.marginLeft = "1em";
      usageDiv.textContent =
        `System: ${tInfo.systemTokens || 0}, ` +
        `History: ${tInfo.historyTokens || 0}, ` +
        `Input: ${tInfo.inputTokens || 0}, ` +
        `Assistant: ${tInfo.assistantTokens || 0}, ` +
        `FinalAsst: ${tInfo.finalAssistantTokens || 0}, ` +
        `Total: ${totalTok}`;
      tokDetails.appendChild(usageDiv);

      metaContainer.appendChild(tokDetails);
    }

    // Direct Link
    const directDetails = document.createElement("details");
    const ddSum = document.createElement("summary");
    ddSum.textContent = "Direct Link";
    directDetails.appendChild(ddSum);

    const ddLink = document.createElement("a");
    ddLink.href = `/pair/${pairId}`;
    ddLink.target = "_blank";
    ddLink.textContent = `/pair/${pairId}`;
    directDetails.appendChild(ddLink);

    metaContainer.appendChild(directDetails);
    seqDiv.appendChild(metaContainer);
  }

  // delete button
  const delBtn = document.createElement("button");
  delBtn.className = "delete-chat-btn";
  delBtn.textContent = "x";
  delBtn.title = "Delete this chat message";
  delBtn.style.marginLeft = "8px";
  delBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    const resp = await fetch(`/api/chat/pair/${pairId}`, {
      method: "DELETE"
    });
    if (resp.ok) {
      seqDiv.remove();
    } else {
      alert("Failed to delete chat pair.");
    }
  });
  botHead.appendChild(delBtn);

  const chatMessagesEl = document.getElementById("chatMessages");
  chatMessagesEl.appendChild(seqDiv);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// ... [rest of main.js remains unchanged] ...

(async function init(){
  await loadSettings();
  await populateFilters();
  await loadTasks();
  try {
    const r = await fetch("/api/model");
    if(r.ok){
      const data = await r.json();
      modelName = data.model || "unknown";
    }
  } catch(e){
    modelName = "unknown";
  }
  $("#modelHud").textContent = "Model: " + modelName;

  await loadTabs();
  if(chatTabs.length>0){
    currentTabId = chatTabs[0].id;
  } else {
    await fetch("/api/chat/tabs/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Main" })
    });
    await loadTabs();
    currentTabId = chatTabs[0].id;
  }
  renderTabs();
  await loadChatHistory(currentTabId);

  try {
    const r2 = await fetch("/api/settings/agent_instructions");
    if(r2.ok){
      const { value } = await r2.json();
      $("#displayedInstructions").textContent = value || "(none)";
      window.agentInstructions = value || "";
    }
  } catch(e){
    console.error("Error loading agent instructions:", e);
    window.agentInstructions = "";
  }

  try {
    const r3 = await fetch("/api/settings/chat_hide_metadata");
    if (r3.ok){
      chatHideMetadata = true;
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "chat_hide_metadata", value: chatHideMetadata })
      });
    }
  } catch(e) {
    console.error("Error loading chat_hide_metadata:", e);
    chatHideMetadata = true;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "chat_hide_metadata", value: chatHideMetadata })
    });
  }

  try {
    const r4 = await fetch("/api/settings/show_subbubble_token_count");
    if(r4.ok){
      const { value } = await r4.json();
      showSubbubbleToken = !!value;
    } else {
      showSubbubbleToken = false;
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "show_subbubble_token_count", value: showSubbubbleToken })
      });
    }
  } catch(e) {
    console.error("Error loading show_subbubble_token_count:", e);
    showSubbubbleToken = false;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "show_subbubble_token_count", value: showSubbubbleToken })
    });
  }

  await loadFileList();

  favElement = document.getElementById("favicon");
  if (favElement) {
    favElement.href = defaultFavicon;
  }

  await chatSettingsSaveFlow();
  await updateProjectInfo();
})();
