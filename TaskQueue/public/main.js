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
let sterlingChatUrlVisible = true;
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

async function setSetting(key, value){
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value })
  });
}

async function getSetting(key){
  const r = await fetch(`/api/settings/${key}`);
  if(!r.ok) return undefined;
  const { value } = await r.json();
  return value;
}

async function toggleTasks(){
  tasksVisible = !tasksVisible;
  $("#tasks").style.display = tasksVisible ? "" : "none";
  $("#toggleTasksBtn").textContent = tasksVisible ? "Hide tasks" : "Show tasks";
  await setSetting("tasks_visible", tasksVisible);
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

  await setSetting("sidebar_visible", sidebarVisible);
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
  const sp = await (await fetch("/api/sprints")).json();
  $("#sprintFilter").innerHTML = '<option value="">All sprints</option>' +
      sp.map(s=>`<option value="${s.sprint}">${s.sprint}</option>`).join("");
}

function openColModal(){
  const cnt = $("#colList");
  cnt.innerHTML="";
  columnsOrder.forEach((c,i)=>{
    const div = document.createElement("div");
    div.className="col-item";
    div.innerHTML = `<button class="col-move" data-idx="${i}" data-dir="up">⬆️</button>` +
        `<button class="col-move" data-idx="${i}" data-dir="down">⬇️</button>` +
        `<label><input type="checkbox" value="${c.key}" ${visibleCols.has(c.key)?"checked":""}/> ${c.label||c.key}</label>`;
    cnt.appendChild(div);
  });
  showModal($("#colModal"));
}
$("#gearBtn").addEventListener("click", openColModal);
$("#colList").addEventListener("click", e=>{
  if(!e.target.classList.contains("col-move")) return;
  const i = +e.target.dataset.idx, d=e.target.dataset.dir;
  const ni = d==="up"?i-1:i+1;
  if(ni<0||ni>=columnsOrder.length) return;
  [columnsOrder[i],columnsOrder[ni]]=[columnsOrder[ni],columnsOrder[i]];
  openColModal();
});
$("#colSaveBtn").addEventListener("click", async ()=>{
  visibleCols.clear();
  $$("#colList input[type=checkbox]").forEach(cb=>{
    if(cb.checked) visibleCols.add(cb.value);
  });
  await saveSettings();
  hideModal($("#colModal"));
  await loadTasks();
});
$("#colCancelBtn").addEventListener("click",()=>hideModal($("#colModal")));

$("#tasks").addEventListener("click", async e=>{
  const btn = e.target.closest("button");
  if(btn){
    if(btn.classList.contains("eye")){
      const id=+btn.dataset.id;
      const hideNow=btn.textContent==="👁️";
      await fetch("/api/tasks/hidden",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id,hidden:hideNow})
      });
      return loadTasks();
    }
    if(btn.classList.contains("arrow")){
      const id=+btn.dataset.id, dir=btn.dataset.dir;
      await fetch("/api/tasks/reorder",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id,direction:dir})
      });
      return loadTasks();
    }
  }
  const cell = e.target;
  const row = cell.closest("tr");
  if(!row) return;
  const taskId=+row.dataset.taskId;

  function inlineEdit(newEl, saveCb){
    cell.textContent="";
    cell.appendChild(newEl);
    newEl.focus();
    newEl.addEventListener("change", async ()=>{
      await saveCb(newEl.value);
      await loadTasks();
    });
    newEl.addEventListener("blur", ()=>loadTasks());
  }

  if(cell.classList.contains("priority-cell")){
    const sel = document.createElement("select");
    ["Low","Medium","High"].forEach(v=>{
      const o=document.createElement("option");
      o.value=v; o.textContent=v;
      if(v===cell.textContent) o.selected=true;
      sel.appendChild(o);
    });
    return inlineEdit(sel,v=>fetch("/api/tasks/priority",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,priority:v})
    }));
  }
  if(cell.classList.contains("status-cell")){
    const sel=document.createElement("select");
    ["Not Started","In Progress","Done"].forEach(v=>{
      const o=document.createElement("option");
      o.value=v; o.textContent=v;
      if(v===cell.textContent) o.selected=true;
      sel.appendChild(o);
    });
    return inlineEdit(sel,v=>fetch("/api/tasks/status",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,status:v})
    }));
  }
  if(cell.classList.contains("project-cell")){
    const inp=document.createElement("input");
    inp.type="text";
    inp.value=cell.textContent;
    return inlineEdit(inp,v=>fetch("/api/tasks/project",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,project:v})
    }));
  }
  if(cell.classList.contains("dependencies-cell")){
    const inp=document.createElement("input");
    inp.type="text";
    inp.value=cell.textContent;
    return inlineEdit(inp,v=>fetch("/api/tasks/dependencies",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,dependencies:v})
    }));
  }
  if(cell.classList.contains("title-cell")){
    const inp=document.createElement("input");
    inp.type="text";
    inp.value=cell.textContent;
    return inlineEdit(inp,v=>fetch("/api/tasks/rename",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:taskId,newTitle:v})
    }));
  }
});

$("#showHidden").addEventListener("change", loadTasks);
$("#projectFilter").addEventListener("change", renderBody);
$("#sprintFilter").addEventListener("change", renderBody);

$("#instrBtn").addEventListener("click", async ()=>{
  {
    const r=await fetch("/api/settings/agent_instructions");
    if(r.ok){
      const {value}=await r.json();
      $("#instrText").value=value||"";
    }
  }
  {
    const r2=await fetch("/api/settings/agent_name");
    if(r2.ok){
      const {value}=await r2.json();
      $("#agentNameInput").value=value||"";
    }
  }
  showModal($("#instrModal"));
});
$("#instrSaveBtn").addEventListener("click", async ()=>{
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"agent_instructions",value:$("#instrText").value})
  });
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"agent_name",value:$("#agentNameInput").value})
  });
  hideModal($("#instrModal"));
});
$("#instrCancelBtn").addEventListener("click",()=>hideModal($("#instrModal")));

$("#repoBtn").addEventListener("click", async ()=>{
  const r=await fetch("/api/settings/github_repo");
  if(r.ok){
    const {value}=await r.json();
    $("#repoInput").value=value||"";
  }
  showModal($("#repoModal"));
});
$("#repoSaveBtn").addEventListener("click", async ()=>{
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"github_repo",value:$("#repoInput").value})
  });
  hideModal($("#repoModal"));
});
$("#repoCancelBtn").addEventListener("click",()=>hideModal($("#repoModal")));

$("#defaultsBtn").addEventListener("click", async ()=>{
  let r=await fetch("/api/settings/default_project");
  if(r.ok){
    const{value}=await r.json();
    $("#defProjectInput").value=value||"";
  }
  r=await fetch("/api/settings/default_sprint");
  if(r.ok){
    const{value}=await r.json();
    $("#defSprintInput").value=value||"";
  }
  showModal($("#defaultsModal"));
});
$("#defSaveBtn").addEventListener("click", async ()=>{
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"default_project",value:$("#defProjectInput").value})
  });
  await fetch("/api/settings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key:"default_sprint",value:$("#defSprintInput").value})
  });
  hideModal($("#defaultsModal"));
});
$("#defCancelBtn").addEventListener("click",()=>hideModal($("#defaultsModal")));

$("#addTaskBtn").addEventListener("click",()=>{
  $("#newTaskTitle").value="";
  $("#newTaskBody").value="";
  showModal($("#newTaskModal"));
});
$("#createTaskBtn").addEventListener("click", async ()=>{
  const title=$("#newTaskTitle").value.trim(),
      body=$("#newTaskBody").value.trim();
  if(!title){
    alert("Please enter a title for the new task.");
    return;
  }
  const res=await fetch("/api/tasks/new",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({title,body})
  });
  if(!res.ok){
    alert("Error creating task. Check console/logs.");
    return;
  }
  hideModal($("#newTaskModal"));
  await loadTasks();
});
$("#cancelTaskBtn").addEventListener("click",()=>hideModal($("#newTaskModal")));

async function loadTabs(){
  const res = await fetch("/api/chat/tabs");
  chatTabs = await res.json();
}
async function addNewTab() {
  const projectInput = prompt("Enter project name (or leave blank):", "");
  if(projectInput){
    await fetch("/api/settings", {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ key: "sterling_project", value: projectInput })
    });
  }

  let autoNaming = false;
  try {
    const r = await fetch("/api/settings/chat_tab_auto_naming");
    if(r.ok){
      const obj = await r.json();
      autoNaming = !!obj.value;
    }
  } catch(e) {
    console.error("Error checking chat_tab_auto_naming:", e);
  }

  let name = "";
  if(!(projectInput && autoNaming)){
    name = prompt("Enter tab name:", "New Tab");
    if(!name) return;
  }

  const r = await fetch("/api/chat/tabs/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if(r.ok){
    await loadTabs();
    renderTabs();
  }
}
async function renameTab(tabId){
  const t = chatTabs.find(t => t.id===tabId);
  const newName = prompt("Enter new tab name:", t ? t.name : "Untitled");
  if(!newName) return;
  const r = await fetch("/api/chat/tabs/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tabId, newName })
  });
  if(r.ok){
    await loadTabs();
    renderTabs();
    renderSidebarTabs();
  }
}
async function deleteTab(tabId){
  if(!confirm("Are you sure you want to delete this tab (and all its messages)?")) return;
  const r = await fetch(`/api/chat/tabs/${tabId}`, { method: "DELETE" });
  if(r.ok){
    await loadTabs();
    if(chatTabs.length>0){
      currentTabId = chatTabs[0].id;
    } else {
      currentTabId=1;
    }
    renderTabs();
    renderSidebarTabs();
    await loadChatHistory(currentTabId);
  }
}
async function selectTab(tabId){
  currentTabId = tabId;
  await setSetting("last_chat_tab", tabId);
  loadChatHistory(tabId);
  renderTabs();
  renderSidebarTabs();
}
function renderTabs(){
  const tc = $("#tabsContainer");
  tc.innerHTML="";
  chatTabs.forEach(tab => {
    const tabBtn = document.createElement("div");
    tabBtn.style.display="flex";
    tabBtn.style.alignItems="center";
    tabBtn.style.cursor="pointer";

    if (tab.id === currentTabId) {
      tabBtn.style.backgroundColor = "#555";
      tabBtn.style.border = "2px solid #aaa";
      tabBtn.style.color = "#fff";
    } else {
      tabBtn.style.backgroundColor = "#333";
      tabBtn.style.border = "1px solid #444";
      tabBtn.style.color = "#ddd";
    }

    tabBtn.style.padding="4px 6px";
    tabBtn.textContent = tab.name;
    tabBtn.addEventListener("click", ()=>selectTab(tab.id));

    tabBtn.addEventListener("contextmenu", e=>{
      e.preventDefault();
      const choice = prompt("Type 'rename' or 'delete':", "");
      if(choice==="rename") renameTab(tab.id);
      else if(choice==="delete") deleteTab(tab.id);
    });
    tc.appendChild(tabBtn);
  });
}

// New function to render vertical chat tabs in sidebar
function renderSidebarTabs(){
  const container = document.getElementById("verticalTabsContainer");
  container.innerHTML="";
  chatTabs.forEach(tab=>{
    const b = document.createElement("button");
    b.textContent = tab.name;
    if(tab.id===currentTabId){
      b.classList.add("active");
    }
    b.addEventListener("click", ()=>selectTab(tab.id));
    b.addEventListener("contextmenu", e=>{
      e.preventDefault();
      const choice=prompt("Type 'rename' or 'delete':","");
      if(choice==="rename") renameTab(tab.id);
      else if(choice==="delete") deleteTab(tab.id);
    });
    container.appendChild(b);
  });
}

document.getElementById("newSideTabBtn").addEventListener("click", addNewTab);

// New: Button to toggle top chat tabs bar
document.getElementById("toggleTopChatTabsBtn").addEventListener("click", () => {
  const topTabs = document.getElementById("chatTabs");
  if (topTabs.style.display === "none") {
    topTabs.style.display = "";
    document.getElementById("toggleTopChatTabsBtn").textContent = "Hide chat tabs bar";
  } else {
    topTabs.style.display = "none";
    document.getElementById("toggleTopChatTabsBtn").textContent = "Show chat tabs bar";
  }
});

document.getElementById("createSterlingChatBtn").addEventListener("click", async () => {
  try {
    const resp = await fetch("/api/createSterlingChat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if(!resp.ok){
      alert("Error creating sterling chat");
      return;
    }
    const data = await resp.json();
    if (data.success && data.sterlingUrl) {
      document.getElementById("sterlingUrlLabel").innerHTML =
          'Sterling chat: <a href="' + data.sterlingUrl + '" target="_blank">' + data.sterlingUrl + '</a>';
    }
  } catch(e) {
    console.error("CreateSterlingChat call failed:", e);
    alert("Error creating sterling chat");
  }
});

document.getElementById("setProjectBtn").addEventListener("click", () => {
  $("#selectedProjectInput").value = "";
  showModal($("#setProjectModal"));
});
document.getElementById("setProjectSaveBtn").addEventListener("click", async () => {
  const pName = $("#selectedProjectInput").value.trim();
  if(!pName){
    alert("Please enter a project name.");
    return;
  }
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "sterling_project", value: pName })
  });
  alert("Project set to: " + pName);
  hideModal($("#setProjectModal"));
  await updateProjectInfo();
});
document.getElementById("setProjectCancelBtn").addEventListener("click", () => {
  hideModal($("#setProjectModal"));
});

async function updateProjectInfo() {
  try {
    let projectName = "";
    let branch = "";
    const r1 = await fetch("/api/settings/sterling_project");
    if(r1.ok){
      const data = await r1.json();
      projectName = data.value || "";
    }
    if(projectName){
      const r2 = await fetch("/api/projectBranches");
      if(r2.ok){
        const branches = await r2.json();
        const found = branches.find(b => b.project === projectName);
        if(found){
          branch = found.base_branch || "";
        }
      }
    }
    if(projectName){
      $("#projectInfo").textContent = branch
          ? `Project: ${projectName} (branch: ${branch})`
          : `Project: ${projectName} (no branch set)`;
    } else {
      $("#projectInfo").textContent = "(No project set)";
    }
  } catch(e) {
    console.error("Error updating project info:", e);
    $("#projectInfo").textContent = "(No project set)";
  }
}

function addChatMessage(pairId, userText, userTs, aiText, aiTs, model, systemContext, fullHistory, tokenInfo) {
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
      try {
        const tInfo = JSON.parse(tokenInfo);
        const inTokens = tInfo.inputTokens || 0;
        const userTokDiv = document.createElement("div");
        userTokDiv.className = "token-indicator";
        userTokDiv.textContent = `In: ${inTokens}`;
        userDiv.appendChild(userTokDiv);
      } catch(e) {}
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
    try {
      const tInfo = JSON.parse(tokenInfo);
      const outTokens = tInfo.finalAssistantTokens || 0;
      const botTokDiv = document.createElement("div");
      botTokDiv.className = "token-indicator";
      botTokDiv.textContent = `Out: ${outTokens}`;
      botDiv.appendChild(botTokDiv);
    } catch(e) {}
  }

  seqDiv.appendChild(botDiv);

  if(!chatHideMetadata){
    let tokObj = null;
    try {
      tokObj = tokenInfo ? JSON.parse(tokenInfo) : null;
    } catch(e) {}

    const totalTokens = tokObj?.total ?? "???";

    const detailsEl = document.createElement("details");
    const summaryEl = document.createElement("summary");
    summaryEl.textContent = `Pair #${pairId} - Model: ${model} - Total Tokens: ${totalTokens}`;
    detailsEl.appendChild(summaryEl);

    const linePair = document.createElement("div");
    linePair.textContent = `Pair #${pairId}`;
    detailsEl.appendChild(linePair);

    const lineModel = document.createElement("div");
    lineModel.textContent = `Model: ${model}`;
    detailsEl.appendChild(lineModel);

    if (systemContext) {
      const sc = document.createElement("div");
      const scTok = tokObj?.systemTokens ?? 0;
      sc.textContent = `System Context (Tokens: ${scTok})`;
      detailsEl.appendChild(sc);
    }

    if (fullHistory) {
      const fhLine = document.createElement("div");
      const fhTok = tokObj?.historyTokens ?? 0;
      fhLine.textContent = `Full History (Tokens: ${fhTok})`;
      detailsEl.appendChild(fhLine);
    }

    if(tokObj){
      const tuLine = document.createElement("div");
      tuLine.textContent = `Token Usage (Tokens: ${tokObj.total})`;
      detailsEl.appendChild(tuLine);
    }

    const linkDiv = document.createElement("div");
    const ddLink = document.createElement("a");
    ddLink.href = `/pair/${pairId}`;
    ddLink.target = "_blank";
    ddLink.textContent = "Direct Link";
    linkDiv.appendChild(ddLink);
    detailsEl.appendChild(linkDiv);

    seqDiv.appendChild(detailsEl);
  }

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

async function loadChatHistory(tabId = 1) {
  const chatMessagesEl = document.getElementById("chatMessages");
  chatMessagesEl.innerHTML="";
  try {
    const pairs = await fetch(`/api/chat/history?tabId=${tabId}`).then(r => r.json());
    for (const p of pairs) {
      const pairDetail = await fetch(`/pair/${p.id}`).then(r=>r.json());
      p._history = pairDetail;
      addChatMessage(
          p.id,
          p.user_text,
          p.timestamp,
          p.ai_text,
          p.ai_timestamp,
          p.model,
          p.system_context,
          p._history,
          p.token_info
      );
    }
  } catch (err) {
    console.error("Error loading chat history:", err);
  }
}

const chatInputEl = document.getElementById("chatInput");
const chatSendBtnEl = document.getElementById("chatSendBtn");
const waitingElem = document.getElementById("waitingCounter");
const scrollDownBtnEl = document.getElementById("scrollDownBtn");

scrollDownBtnEl.addEventListener("click", ()=>{
  const chatMessagesEl = document.getElementById("chatMessages");
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
});

chatInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatSendBtnEl.click();
  }
});

chatSendBtnEl.addEventListener("click", async () => {
  const chatMessagesEl = document.getElementById("chatMessages");
  const userMessage = chatInputEl.value.trim();
  if(!userMessage) return;
  const userTime = new Date().toISOString();

  if (favElement) favElement.href = rotatingFavicon;

  chatInputEl.value = "";

  const seqDiv = document.createElement("div");
  seqDiv.className = "chat-sequence";

  const userDiv = document.createElement("div");
  userDiv.className = "chat-user";
  {
    const userHead = document.createElement("div");
    userHead.className = "bubble-header";
    userHead.innerHTML = `
      <div class="name-oval name-oval-user">User</div>
      <span style="opacity:0.8;">${formatTimestamp(userTime)}</span>
    `;
    userDiv.appendChild(userHead);

    const userBody = document.createElement("div");
    userBody.textContent = userMessage;
    userDiv.appendChild(userBody);
  }
  seqDiv.appendChild(userDiv);

  const botDiv = document.createElement("div");
  botDiv.className = "chat-bot";

  const botHead = document.createElement("div");
  botHead.className = "bubble-header";
  botHead.innerHTML = `
    <div class="name-oval name-oval-ai">${window.agentName} (${modelName})</div>
    <span style="opacity:0.8;">…</span>
  `;
  botDiv.appendChild(botHead);

  const botBody = document.createElement("div");
  botBody.textContent = "Thinking…";
  botDiv.appendChild(botBody);

  seqDiv.appendChild(botDiv);
  chatMessagesEl.appendChild(seqDiv);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

  let partialText = "";
  let waitTime=0;
  waitingElem.textContent = "Waiting: 0.0s";
  const waitInterval = setInterval(()=>{
    waitTime+=0.1;
    waitingElem.textContent = `Waiting: ${waitTime.toFixed(1)}s`;
  }, 100);

  try {
    const resp = await fetch("/api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message:userMessage, tabId: currentTabId, userTime})
    });
    clearInterval(waitInterval);
    waitingElem.textContent = "";

    if(!resp.ok){
      botBody.textContent = "[Error contacting AI]";
      botHead.querySelector("span").textContent = formatTimestamp(new Date().toISOString());
    } else {
      const reader = resp.body.getReader();
      while(true){
        const { value, done } = await reader.read();
        if(done) break;
        partialText += new TextDecoder().decode(value);
        botBody.textContent = partialText;
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      }
      botHead.querySelector("span").textContent = formatTimestamp(new Date().toISOString());
    }

    // POST: Code change request creation after user input
    await fetch("/api/tasks/new", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        title: "[Code Change Request] " + userMessage.slice(0,60),
        body: partialText
      })
    });

    await loadChatHistory(currentTabId);
  } catch(e) {
    clearInterval(waitInterval);
    waitingElem.textContent = "";
    botBody.textContent = "[Error occurred]";
    botHead.querySelector("span").textContent = formatTimestamp(new Date().toISOString());
  }

  if (favElement) favElement.href = defaultFavicon;

  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
});

$("#chatSettingsBtn").addEventListener("click", async () => {
  const r = await fetch("/api/settings/chat_hide_metadata");
  if(r.ok){
    const { value } = await r.json();
    chatHideMetadata = !!value;
  }
  const r2 = await fetch("/api/settings/chat_tab_auto_naming");
  if(r2.ok){
    const { value } = await r2.json();
    chatTabAutoNaming = !!value;
  }
  const r3 = await fetch("/api/settings/show_subbubble_token_count");
  if(r3.ok){
    const { value } = await r3.json();
    showSubbubbleToken = !!value;
  }
  const r4 = await fetch("/api/settings/sterling_chat_url_visible");
  if(r4.ok){
    const { value } = await r4.json();
    sterlingChatUrlVisible = value !== false;
  }

  $("#hideMetadataCheck").checked = chatHideMetadata;
  $("#autoNamingCheck").checked = chatTabAutoNaming;
  $("#subbubbleTokenCheck").checked = showSubbubbleToken;
  $("#sterlingUrlCheck").checked = sterlingChatUrlVisible;

  try {
    const modelListResp = await fetch("/api/ai/models");
    if(modelListResp.ok){
      const modelData = await modelListResp.json();
      const aiModelSelect = $("#aiModelSelect");
      aiModelSelect.innerHTML = "";
      const relevantModels = modelData.models || [];
      relevantModels.forEach(m=>{
        const opt=document.createElement("option");
        opt.value=m;
        opt.textContent=m;
        aiModelSelect.appendChild(opt);
      });
      const currentModel = await getSetting("ai_model");
      if(currentModel) aiModelSelect.value = currentModel;
    }
  } catch(e){
    console.error("Error populating AI service/model lists:", e);
  }

  showModal($("#chatSettingsModal"));
});

// React when AI service changes
$("#aiServiceSelect").addEventListener("change", async ()=>{
  try {
    const modelListResp = await fetch("/api/ai/models");
    if(modelListResp.ok){
      const modelData = await modelListResp.json();
      const aiModelSelect = $("#aiModelSelect");
      aiModelSelect.innerHTML = "";
      const relevantModels = modelData.models || [];
      relevantModels.forEach(m=>{
        const opt=document.createElement("option");
        opt.value=m; 
        opt.textContent=m;
        aiModelSelect.appendChild(opt);
      });
    }
  } catch(e){
    console.error("Error populating AI service/model lists:", e);
  }
});

async function chatSettingsSaveFlow() {
  chatHideMetadata = $("#hideMetadataCheck").checked;
  chatTabAutoNaming = $("#autoNamingCheck").checked;
  showSubbubbleToken = $("#subbubbleTokenCheck").checked;
  sterlingChatUrlVisible = $("#sterlingUrlCheck").checked;

  await setSetting("chat_hide_metadata", chatHideMetadata);
  await setSetting("chat_tab_auto_naming", chatTabAutoNaming);
  await setSetting("show_subbubble_token_count", showSubbubbleToken);
  await setSetting("sterling_chat_url_visible", sterlingChatUrlVisible);

  const serviceSel = $("#aiServiceSelect").value;
  const modelSel = $("#aiModelSelect").value;
  await setSetting("ai_service", serviceSel);
  await setSetting("ai_model", modelSel);

  hideModal($("#chatSettingsModal"));
  await loadChatHistory(currentTabId);
  toggleSterlingUrlVisibility(sterlingChatUrlVisible);
}

$("#chatSettingsSaveBtn").addEventListener("click", chatSettingsSaveFlow);

$("#chatSettingsCancelBtn").addEventListener("click", () => {
  hideModal($("#chatSettingsModal"));
});

function toggleSterlingUrlVisibility(visible) {
  const el = document.getElementById("sterlingUrlLabel");
  if(!el) return;
  el.style.display = visible ? "inline" : "none";
}

(function installDividerDrag(){
  const divider = $("#divider");
  let isDragging = false;
  let startX = 0;
  let startWidth = 0;
  let finalWidth = 0;

  divider.addEventListener("mousedown", e => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startWidth = $(".sidebar").offsetWidth;
    finalWidth = startWidth;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", e => {
    if(!isDragging) return;
    const dx = e.clientX - startX;
    const newWidth = startWidth + dx;
    const minWidth = 150;
    if(newWidth >= minWidth) {
      $(".sidebar").style.width = newWidth + "px";
      finalWidth = newWidth;
    }
  });

  document.addEventListener("mouseup", () => {
    if(isDragging){
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "sidebar_width", value: finalWidth })
      });
    }
    isDragging = false;
    document.body.style.userSelect = "";
  });
})();

async function loadFileList() {
  try {
    const files = await fetch("/api/upload/list").then(r => r.json());
    const listEl = $("#secureFilesList");
    listEl.innerHTML = "";
    files.forEach(fn => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = `/uploads/${fn}`;
      link.target = "_blank";
      link.textContent = fn;
      li.appendChild(link);
      listEl.appendChild(li);
    });
  } catch(e) {
    console.error("Error fetching file list:", e);
  }
}

$("#secureUploadForm").addEventListener("submit", async e => {
  e.preventDefault();
  const file = $("#fileInput").files[0];
  if(!file) {
    alert("Please select a file first.");
    return;
  }
  console.log("[Uploader Debug] Uploading file:", file.name);

  const formData = new FormData();
  formData.append("myfile", file, file.name);

  try {
    const resp = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
    if(!resp.ok){
      console.error("[Uploader Debug] Server responded with status:", resp.status);
      alert("Upload failed. Check console for details.");
      return;
    }
    const result = await resp.json();
    if(result.success){
      alert("File uploaded successfully!");
      await loadFileList();
    } else {
      alert("Upload error: " + (result.error || "Unknown error"));
    }
  } catch(err) {
    console.error("[Uploader Debug] Upload error:", err);
    alert("Upload error. Check console.");
  }
});

document.addEventListener("click", async (ev) => {
  const cell = ev.target;
  if (!cell.classList.contains("project-rename-cell")) return;
  const oldName = cell.dataset.oldproj;
  function inlineEdit(newEl, saveCb){
    const original = cell.textContent;
    cell.textContent = "";
    cell.appendChild(newEl);
    newEl.focus();
    newEl.addEventListener("change", async ()=>{
      await saveCb(newEl.value);
    });
    newEl.addEventListener("blur", ()=>{
      renderProjectsTable();
    });
  }
  const input = document.createElement("input");
  input.type = "text";
  input.value = oldName;
  inlineEdit(input, async (val) => {
    const newName = val.trim();
    if (!newName || newName === oldName) {
      cell.textContent = oldName;
      return;
    }
    const resp = await fetch("/api/projects/rename", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ oldProject: oldName, newProject: newName })
    });
    if (!resp.ok){
      alert("Error renaming project");
      cell.textContent = oldName;
      return;
    }
    cell.textContent = newName;
    cell.dataset.oldproj = newName;
    await renderProjectsTable();
  });
});

async function openProjectsModal(){
  showModal($("#projectsModal"));
  await renderProjectsTable();
}

async function renderProjectsTable(){
  const tblBody = $("#projectsTable tbody");
  tblBody.innerHTML = "";

  const [projects, branches] = await Promise.all([
    fetch("/api/projects").then(r=>r.json()),
    fetch("/api/projectBranches").then(r=>r.json())
  ]);

  const branchMap = {};
  branches.forEach(b => { branchMap[b.project] = b.base_branch; });

  const projNamesSet = new Set();
  projects.forEach(p => projNamesSet.add(p.project));
  branches.forEach(b => projNamesSet.add(b.project));
  const allProjectNames = [...projNamesSet].sort();

  allProjectNames.forEach(projectName => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="project-rename-cell" style="border:1px solid #444; padding:2px 4px;" data-oldproj="${projectName}">${projectName}</td>
      <td style="border:1px solid #444; padding:2px 4px;">
        <input type="text" data-proj="${projectName}" class="projBranchInput" style="width:95%;" />
      </td>
      <td style="border:1px solid #444; padding:2px 4px;"></td>
    `;
    tblBody.appendChild(tr);
  });

  $$(".projBranchInput", tblBody).forEach(inp => {
    const proj = inp.dataset.proj;
    inp.value = branchMap[proj] || "";
  });
}

async function saveProjectBranches(){
  const inps = $$(".projBranchInput");
  const data = inps.map(inp => ({
    project: inp.dataset.proj,
    base_branch: inp.value.trim()
  }));
  const resp = await fetch("/api/projectBranches", {
    method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ data })
  });
  if(!resp.ok) {
    alert("Error saving project branches.");
    return;
  }
  hideModal($("#projectsModal"));
}

$("#projConfigBtn").addEventListener("click", openProjectsModal);
$("#projectsSaveBtn").addEventListener("click", saveProjectBranches);
$("#projectsCancelBtn").addEventListener("click", ()=>hideModal($("#projectsModal")));

const navFileTreeBtn = document.getElementById("navFileTreeBtn");
const sidebarViewFileTree = document.getElementById("sidebarViewFileTree");
const sidebarViewTasks = document.getElementById("sidebarViewTasks");
const sidebarViewUploader = document.getElementById("sidebarViewUploader");
const sidebarViewChatTabs = document.getElementById("sidebarViewChatTabs");
const sidebarViewActivityIframe = document.getElementById("sidebarViewActivityIframe");
const fileTreeContainer = document.getElementById("fileTreeContainer");

function showTasksPanel(){
  sidebarViewTasks.style.display = "";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  $("#navTasksBtn").classList.add("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "tasks");
}

function showUploaderPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.add("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "uploader");
}

function showFileTreePanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "none";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.add("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "fileTree");
  loadFileTree();
}

function showChatTabsPanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "";
  sidebarViewActivityIframe.style.display = "none";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.add("active");
  $("#navActivityIframeBtn").classList.remove("active");
  setSetting("last_sidebar_view", "chatTabs");
  renderSidebarTabs();
}

function showActivityIframePanel(){
  sidebarViewTasks.style.display = "none";
  sidebarViewUploader.style.display = "none";
  sidebarViewFileTree.style.display = "none";
  sidebarViewChatTabs.style.display = "none";
  sidebarViewActivityIframe.style.display = "";
  $("#navTasksBtn").classList.remove("active");
  $("#navUploaderBtn").classList.remove("active");
  $("#navFileTreeBtn").classList.remove("active");
  $("#navChatTabsBtn").classList.remove("active");
  $("#navActivityIframeBtn").classList.add("active");
  setSetting("last_sidebar_view", "activity");
}

/**
 * Recursively render the file tree structure
 */
function createTreeNode(node, repoName, chatNumber) {
  const li = document.createElement("li");

  if(node.type === "directory") {
    const expander = document.createElement("span");
    expander.textContent = "[+] ";
    expander.style.cursor = "pointer";
    li.appendChild(expander);

    const label = document.createElement("span");
    label.textContent = node.name;
    label.style.fontWeight = "bold";
    li.appendChild(label);

    const ul = document.createElement("ul");
    ul.style.display = "none";
    li.appendChild(ul);

    expander.addEventListener("click", () => {
      if(ul.style.display === "none"){
        ul.style.display = "";
        expander.textContent = "[-] ";
      } else {
        ul.style.display = "none";
        expander.textContent = "[+] ";
      }
    });

    if(Array.isArray(node.children)){
      node.children.forEach(child => {
        ul.appendChild(createTreeNode(child, repoName, chatNumber));
      });
    }

  } else {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `checkbox_${node.path}`;
    cb.checked = !!node.isAttached;
    li.appendChild(cb);

    const label = document.createElement("span");
    label.textContent = " " + node.name;
    li.appendChild(label);

    cb.addEventListener("change", async () => {
      console.debug(`[FileTree Debug] Checkbox changed for: ${node.path}, new checked state: ${cb.checked}`);
      try {
        console.debug(`[FileTree Debug] Sending POST to toggle attachment for file: ${node.path}`);
        const resp = await fetch(`http://localhost:3444/api/${repoName}/chat/${chatNumber}/toggle_attached`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath: node.path })
        });
        const data = await resp.json();
        console.debug("[FileTree Debug] toggle_attached response:", data);
      } catch(err) {
        console.error("Error toggling file attachment:", err);
      }
    });
  }

  return li;
}

async function loadFileTree(){
  fileTreeContainer.innerHTML = "Loading file tree...";
  try {
    const r = await fetch("/api/settings/sterling_chat_url");
    if(!r.ok){
      fileTreeContainer.textContent = "No sterling_chat_url found. Create a chat first.";
      return;
    }
    const { value: urlVal } = await r.json();
    if(!urlVal){
      fileTreeContainer.textContent = "No sterling_chat_url set. Create a chat first.";
      return;
    }

    const splitted = urlVal.split("/");
    const chatNumber = splitted.pop();
    splitted.pop();
    const repoName = decodeURIComponent(splitted.pop());

    const treeRes = await fetch(`http://localhost:3444/api/listFileTree/${repoName}/${chatNumber}`);
    if(!treeRes.ok){
      fileTreeContainer.textContent = "Error fetching file tree from Sterling.";
      return;
    }
    const data = await treeRes.json();
    if(!data.success){
      fileTreeContainer.textContent = "Sterling error: " + JSON.stringify(data);
      return;
    }

    fileTreeContainer.innerHTML = "";
    const rootUl = document.createElement("ul");
    data.tree.children.forEach(childNode => {
      rootUl.appendChild(createTreeNode(childNode, repoName, chatNumber));
    });
    fileTreeContainer.appendChild(rootUl);

  } catch(err) {
    fileTreeContainer.textContent = "Error: " + err.message;
  }
}

/**
 * Sidebar nav toggling
 */
const btnTasks = document.getElementById("navTasksBtn");
const btnUploader = document.getElementById("navUploaderBtn");
const btnChatTabs = document.getElementById("navChatTabsBtn");
const btnActivityIframe = document.getElementById("navActivityIframeBtn");

btnTasks.addEventListener("click", showTasksPanel);
btnUploader.addEventListener("click", showUploaderPanel);
navFileTreeBtn.addEventListener("click", showFileTreePanel);
btnChatTabs.addEventListener("click", showChatTabsPanel);
btnActivityIframe.addEventListener("click", showActivityIframePanel);

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

  const lastChatTab = await getSetting("last_chat_tab");
  if(lastChatTab) {
    const foundTab = chatTabs.find(t => t.id === parseInt(lastChatTab,10));
    if(foundTab) currentTabId = foundTab.id;
    else if(chatTabs.length>0) currentTabId=chatTabs[0].id;
  } else {
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
  }
  renderTabs();
  renderSidebarTabs();
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
      await setSetting("chat_hide_metadata", chatHideMetadata);
    }
  } catch(e) {
    console.error("Error loading chat_hide_metadata:", e);
    chatHideMetadata = true;
    await setSetting("chat_hide_metadata", chatHideMetadata);
  }

  try {
    const r4 = await fetch("/api/settings/show_subbubble_token_count");
    if(r4.ok){
      const { value } = await r4.json();
      showSubbubbleToken = !!value;
    } else {
      showSubbubbleToken = false;
      await setSetting("show_subbubble_token_count", showSubbubbleToken);
    }
  } catch(e) {
    console.error("Error loading show_subbubble_token_count:", e);
    showSubbubbleToken = false;
    await setSetting("show_subbubble_token_count", showSubbubbleToken);
  }

  await loadFileList();

  favElement = document.getElementById("favicon");
  if (favElement) {
    favElement.href = defaultFavicon;
  }

  await chatSettingsSaveFlow();
  await updateProjectInfo();

  try {
    const r = await fetch("/api/settings/sterling_chat_url");
    if(r.ok){
      const { value } = await r.json();
      if(value){
        document.getElementById("sterlingUrlLabel").innerHTML =
            'Sterling chat: <a href="' + value + '" target="_blank">' + value + '</a>';
      }
    }
  } catch(e){
    console.error("Error fetching sterling_chat_url:", e);
  }
  toggleSterlingUrlVisibility(sterlingChatUrlVisible);

  let lastView = await getSetting("last_sidebar_view");
  if(!lastView) lastView = "tasks";
  switch(lastView){
    case "uploader": showUploaderPanel(); break;
    case "fileTree": showFileTreePanel(); break;
    case "chatTabs": showChatTabsPanel(); break;
    case "activity": showActivityIframePanel(); break;
    default: showTasksPanel(); break;
  }
})();
