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
let markdownPanelVisible = false;
let sidebarVisible = true;
let chatTabs = [];
let currentTabId = 1;
let chatHideMetadata = false;
let chatTabAutoNaming = false;
let showSubbubbleToken = false;
let sterlingChatUrlVisible = true;
let chatStreaming = true; // new toggle for streaming
let enterSubmitsMessage = true; // new toggle for Enter key submit
let navMenuVisible = false; // visibility of the top navigation menu
window.agentName = "Alfe";

// For per-tab model arrays
let modelTabs = [];
let currentModelTabId = null;
let modelTabsBarVisible = false;

const defaultFavicon = "alfe_favicon_clean_64x64.ico";
const rotatingFavicon = "alfe_favicon_clean_64x64.ico";
let favElement = null;

const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];

/* Introduce an image buffer and preview, plus an array to hold their descriptions. */
let pendingImages = [];
let pendingImageDescs = [];

/* Utility formatting functions, event handlers, rendering logic, etc. */
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

async function toggleMarkdownPanel(){
  markdownPanelVisible = !markdownPanelVisible;
  $("#taskListPanel").style.display = markdownPanelVisible ? "" : "none";
  await setSetting("markdown_panel_visible", markdownPanelVisible);
}

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

async function toggleNavMenu(){
  navMenuVisible = !navMenuVisible;
  toggleNavMenuVisibility(navMenuVisible);
  const check = document.getElementById("showNavMenuCheck");
  if(check) check.checked = navMenuVisible;
  await setSetting("nav_menu_visible", navMenuVisible);
}
document.getElementById("navMenuToggle").addEventListener("click", toggleNavMenu);

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
    const r = await fetch("/api/settings/markdown_panel_visible");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== "undefined"){
        markdownPanelVisible = !!value;
      }
    }
    $("#taskListPanel").style.display = markdownPanelVisible ? "" : "none";
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
    const r = await fetch("/api/settings/enter_submits_message");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== "undefined"){
        enterSubmitsMessage = (value !== false);
      }
    }
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
  {
    const r = await fetch("/api/settings/model_tabs_bar_visible");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== 'undefined'){
        modelTabsBarVisible = !!value;
      }
    }
    const cont = document.getElementById("modelTabsContainer");
    const newBtn = document.getElementById("newModelTabBtn");
    const toggleBtn = document.getElementById("toggleModelTabsBtn");
    if(cont) cont.style.display = modelTabsBarVisible ? "" : "none";
    if(newBtn) newBtn.style.display = modelTabsBarVisible ? "" : "none";
    if(toggleBtn) toggleBtn.textContent = modelTabsBarVisible ? "Hide Models" : "Models";
  }
  {
    const r = await fetch("/api/settings/nav_menu_visible");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== 'undefined'){
        navMenuVisible = value !== false;
      }
    }
    toggleNavMenuVisibility(navMenuVisible);
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
$("#colBtn").addEventListener("click", openColModal);
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
  // Now we store/read from "taskList_git_ssh_url" instead of "github_repo"
  const r=await fetch("/api/settings/taskList_git_ssh_url");
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
    body:JSON.stringify({key:"taskList_git_ssh_url",value:$("#repoInput").value})
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
      headers: { "Content-Type":"application/json" },
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
    await loadChatHistory(currentTabId, true);
  }
}
async function selectTab(tabId){
  currentTabId = tabId;
  await setSetting("last_chat_tab", tabId);
  loadChatHistory(tabId, true);
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
      headers: { "Content-Type":"application/json" },
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
    headers: { "Content-Type":"application/json" },
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

function parseProviderModel(model) {
  if(!model) return { provider: "Unknown", shortModel: "Unknown" };
  if(model.startsWith("openai/")) {
    return { provider: "openai", shortModel: model.replace(/^openai\//,'') };
  } else if(model.startsWith("openrouter/")) {
    return { provider: "openrouter", shortModel: model.replace(/^openrouter\//,'') };
  } else if(model.startsWith("deepseek/")) {
    return { provider: "openrouter", shortModel: model.replace(/^deepseek\//,'') };
  }
  return { provider: "Unknown", shortModel: model };
}

function getEncoding(modelName) {
  console.debug("[Server Debug] Attempting to load tokenizer for model =>", modelName);
  try {
    return encoding_for_model(modelName);
  } catch (e) {
    console.debug("[Server Debug] Tokenizer load failed, falling back to gpt-3.5-turbo =>", e.message);
    return encoding_for_model("gpt-3.5-turbo");
  }
}

function countTokens(encoder, text) {
  return encoder.encode(text || "").length;
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
  if (enterSubmitsMessage && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatSendBtnEl.click();
  }
});

chatSendBtnEl.addEventListener("click", async () => {
  const chatMessagesEl = document.getElementById("chatMessages");
  const userMessage = chatInputEl.value.trim();
  if(!userMessage && pendingImages.length===0) return;

  if (favElement) favElement.href = rotatingFavicon;

  // 1) If there are images pending, process them to get descriptions, but do NOT call loadChatHistory now.
  let descsForThisSend = [];
  if(pendingImages.length>0){
    // Show the loading indicator for image processing
    const loaderEl = document.getElementById("imageProcessingIndicator");
    if(loaderEl) loaderEl.style.display = "";
    // Disable chat input and send button while images upload
    chatInputEl.disabled = true;
    chatSendBtnEl.disabled = true;

    try {
      for(const f of pendingImages){
        try {
          const formData = new FormData();
          formData.append("imageFile", f);
          let uploadResp = await fetch(`/api/chat/image?tabId=${currentTabId}`, {
            method: "POST",
            body: formData
          });
          if(!uploadResp.ok){
            console.error("Image upload error, status:", uploadResp.status);
          } else {
            const json = await uploadResp.json();
            if(json.desc){
              // Show bracketed text with filename
              descsForThisSend.push(`[filename: ${json.filename}] [desc: ${json.desc}]`);
            }
          }
        } catch(e){
          console.error("Error uploading image:", e);
        }
      }
    } finally {
      // Hide the loading indicator
      if(loaderEl) loaderEl.style.display = "none";
      // Re-enable chat input and send button
      chatInputEl.disabled = false;
      chatSendBtnEl.disabled = false;
    }

    // Clear the buffer for images
    pendingImages = [];
    updateImagePreviewList();
  }

  // If user typed nothing but we have desc subbubbles, we can still show them in a single bubble
  if(!userMessage && descsForThisSend.length>0){
    chatInputEl.value = "";
  } else if(!userMessage && descsForThisSend.length===0){
    if (favElement) favElement.href = defaultFavicon;
    return;
  }

  chatInputEl.value = "";

  // Create the single chat-sequence
  const seqDiv = document.createElement("div");
  seqDiv.className = "chat-sequence";

  // The user bubble
  const userDiv = document.createElement("div");
  userDiv.className = "chat-user";

  const userHead = document.createElement("div");
  userHead.className = "bubble-header";
  const userTime = new Date().toISOString();
  userHead.innerHTML = `
    <div class="name-oval name-oval-user">User</div>
    <span style="opacity:0.8;">${formatTimestamp(userTime)}</span>
  `;
  userDiv.appendChild(userHead);

  // For each image desc, add a subbubble
  descsForThisSend.forEach(d => {
    const descBubble = document.createElement("div");
    descBubble.textContent = d;
    descBubble.style.marginBottom = "8px";
    descBubble.style.borderLeft = "2px solid #ccc";
    descBubble.style.paddingLeft = "6px";
    userDiv.appendChild(descBubble);
  });

  // Then the user's typed text as last subbubble
  if(userMessage){
    const userBody = document.createElement("div");
    userBody.textContent = userMessage;
    userDiv.appendChild(userBody);
  }

  seqDiv.appendChild(userDiv);

  // The AI bubble
  const botDiv = document.createElement("div");
  botDiv.className = "chat-bot";

  const botHead = document.createElement("div");
  botHead.className = "bubble-header";
  botHead.innerHTML = `
    <div class="name-oval name-oval-ai" title="${modelName}">${window.agentName}</div>
    <span style="opacity:0.8;">…</span>
  `;
  botDiv.appendChild(botHead);

  const botBody = document.createElement("div");
  botBody.textContent = "Thinking…";
  botDiv.appendChild(botBody);

  seqDiv.appendChild(botDiv);
  chatMessagesEl.appendChild(seqDiv);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

  let combinedUserText = "";
  if(descsForThisSend.length>0){
    combinedUserText = descsForThisSend.join("\n") + "\n\n";
  }
  if(userMessage){
    combinedUserText += userMessage;
  }

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
      body:JSON.stringify({message:combinedUserText, tabId: currentTabId, userTime})
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

    await loadChatHistory(currentTabId, true);
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
    if(typeof value !== "undefined"){
      chatHideMetadata = !!value;
    } else {
      chatHideMetadata = false;
    }
  } else {
    chatHideMetadata = false;
    await setSetting("chat_hide_metadata", chatHideMetadata);
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
  } else {
    showSubbubbleToken = true;
    await setSetting("show_subbubble_token_count", showSubbubbleToken);
  }

  const r4 = await fetch("/api/settings/sterling_chat_url_visible");
  if(r4.ok){
    const { value } = await r4.json();
    sterlingChatUrlVisible = value !== false;
  } else {
    sterlingChatUrlVisible = true;
    await setSetting("sterling_chat_url_visible", sterlingChatUrlVisible);
  }

  try {
    const r5 = await fetch("/api/settings/chat_streaming");
    if(r5.ok){
      const { value } = await r5.json();
      chatStreaming = (value !== false);
    }
    $("#chatStreamingCheck").checked = chatStreaming;
  } catch(e) {
    console.error("Error loading chat_streaming:", e);
    chatStreaming = true;
  }

  const r6 = await fetch("/api/settings/markdown_panel_visible");
  if(r6.ok){
    const { value } = await r6.json();
    markdownPanelVisible = !!value;
  }

  const r7 = await fetch("/api/settings/enter_submits_message");
  if(r7.ok){
    const { value } = await r7.json();
    enterSubmitsMessage = (value !== false);
  } else {
    enterSubmitsMessage = true;
    await setSetting("enter_submits_message", enterSubmitsMessage);
  }

  const r8 = await fetch("/api/settings/nav_menu_visible");
  if(r8.ok){
    const { value } = await r8.json();
    navMenuVisible = value !== false;
  }

  $("#hideMetadataCheck").checked = chatHideMetadata;
  $("#autoNamingCheck").checked = chatTabAutoNaming;
  $("#subbubbleTokenCheck").checked = showSubbubbleToken;
  $("#sterlingUrlCheck").checked = sterlingChatUrlVisible;
  $("#showMarkdownTasksCheck").checked = markdownPanelVisible;
  $("#enterSubmitCheck").checked = enterSubmitsMessage;
  $("#showNavMenuCheck").checked = navMenuVisible;

  try {
    const modelListResp = await fetch("/api/ai/models");
    if(modelListResp.ok){
      const modelData = await modelListResp.json();
      window.allAiModels = modelData.models || [];

      const aiModelSelect = $("#aiModelSelect");

      function updateAiModelSelect() {
        aiModelSelect.innerHTML = "";
        const filterFav = $("#favoritesOnlyModelCheck").checked;
        const providerFilterSel = $("#aiModelProviderSelect");
        let selectedProvider = providerFilterSel ? providerFilterSel.value : "";

        let filtered = window.allAiModels.slice();
        if(filterFav) {
          filtered = filtered.filter(m => m.favorite);
        }
        if(selectedProvider) {
          filtered = filtered.filter(m => (m.provider === selectedProvider));
        }

        filtered.forEach(m => {
          aiModelSelect.appendChild(
              new Option(
                  `${m.id} (limit ${m.tokenLimit}, in ${m.inputCost}, out ${m.outputCost})`,
                  m.id
              )
          );
        });
      }

      updateAiModelSelect();

      $("#favoritesOnlyModelCheck").addEventListener("change", () => {
        updateAiModelSelect();
      });

      const providerSel = $("#aiModelProviderSelect");
      if (providerSel) {
        providerSel.addEventListener("change", () => {
          updateAiModelSelect();
        });
      }

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
      const modelData = modelListResp.json();
      window.allAiModels = (await modelData).models || [];

      const aiModelSelect = $("#aiModelSelect");

      function updateAiModelSelect() {
        aiModelSelect.innerHTML = "";
        const filterFav = $("#favoritesOnlyModelCheck").checked;
        const providerFilterSel = $("#aiModelProviderSelect");
        let selectedProvider = providerFilterSel ? providerFilterSel.value : "";

        let filtered = window.allAiModels.slice();
        if(filterFav) {
          filtered = filtered.filter(m => m.favorite);
        }
        if(selectedProvider) {
          filtered = filtered.filter(m => (m.provider === selectedProvider));
        }

        filtered.forEach(m => {
          aiModelSelect.appendChild(
              new Option(
                  `${m.id} (limit ${m.tokenLimit}, in ${m.inputCost}, out ${m.outputCost})`,
                  m.id
              )
          );
        });
      }
      updateAiModelSelect();

      const currentModel = await getSetting("ai_model");
      if(currentModel) aiModelSelect.value = currentModel;
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
  chatStreaming = $("#chatStreamingCheck").checked;
  markdownPanelVisible = $("#showMarkdownTasksCheck").checked;
  enterSubmitsMessage = $("#enterSubmitCheck").checked;
  navMenuVisible = $("#showNavMenuCheck").checked;

  await setSetting("chat_hide_metadata", chatHideMetadata);
  await setSetting("chat_tab_auto_naming", chatTabAutoNaming);
  await setSetting("show_subbubble_token_count", showSubbubbleToken);
  await setSetting("sterling_chat_url_visible", sterlingChatUrlVisible);
  await setSetting("chat_streaming", chatStreaming);
  await setSetting("markdown_panel_visible", markdownPanelVisible);
  await setSetting("enter_submits_message", enterSubmitsMessage);
  await setSetting("nav_menu_visible", navMenuVisible);

  const serviceSel = $("#aiServiceSelect").value;
  const modelSel = $("#aiModelSelect").value;
  await setSetting("ai_service", serviceSel);
  if (modelSel.trim()) {
    await setSetting("ai_model", modelSel.trim());
  }

  const updatedModelResp = await fetch("/api/model");
  console.debug("[Client Debug] /api/model => status:", updatedModelResp.status);
  if(updatedModelResp.ok){
    const updatedModelData = await updatedModelResp.json();
    console.debug("[Client Debug] /api/model data =>", updatedModelData);
    modelName = updatedModelData.model || "unknown";
    const { provider: autoProvider } = parseProviderModel(modelName);
    console.log("[OBTAINED PROVIDER] => (global model removed in UI, fallback only)");
    console.log("[OBTAINED PROVIDER] =>", autoProvider);
    $("#modelHud").textContent = "";
  }

  hideModal($("#chatSettingsModal"));
  await loadChatHistory(currentTabId, true);
  toggleSterlingUrlVisibility(sterlingChatUrlVisible);
  toggleNavMenuVisibility(navMenuVisible);
  document.getElementById("taskListPanel").style.display = markdownPanelVisible ? "" : "none";
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

function toggleNavMenuVisibility(visible) {
  const navEl = document.querySelector("nav.tree-menu");
  if(!navEl) return;
  navEl.style.display = visible ? "" : "none";
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
        headers: { "Content-Type":"application/json" },
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
        const resp = await axios.post(`https://openrouter.ai/api/v1/${repoName}/chat/${chatNumber}/toggle_attached`, {
          filePath: node.path
        });
        console.debug("[FileTree Debug] toggle_attached response:", resp.data);
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
    console.debug("[Client Debug] /api/model => status:", r.status);
    if(r.ok){
      const data = await r.json();
      console.debug("[Client Debug] /api/model data =>", data);
      modelName = data.model || "unknown";
    }
  } catch(e){
    modelName = "unknown";
  }

  console.log("[OBTAINED PROVIDER] => (global model removed in UI, fallback only)");
  const { provider: autoProvider } = parseProviderModel(modelName);
  console.log("[OBTAINED PROVIDER] =>", autoProvider);
  $("#modelHud").textContent = "";

  await loadTabs();

  const lastChatTab = await getSetting("last_chat_tab");
  if(lastChatTab) {
    const foundTab = chatTabs.find(t => t.id===parseInt(lastChatTab,10));
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
  await loadChatHistory(currentTabId, true);

  try {
    const r2 = await fetch("/api/settings/agent_instructions");
    if(r2.ok){
      const { value } = await r2.json();
      const displayedInstrEl = document.querySelector("#displayedInstructions");
      if (displayedInstrEl) {
        displayedInstrEl.textContent = value || "(none)";
      }
      window.agentInstructions = value || "";
    }
  } catch(e){
    console.error("Error loading agent instructions:", e);
    window.agentInstructions = "";
  }

  // Previously forced chatHideMetadata to "true" – now corrected:
  try {
    const r3 = await fetch("/api/settings/chat_hide_metadata");
    if(r3.ok){
      const j = await r3.json();
      if(typeof j.value !== "undefined"){
        chatHideMetadata = !!j.value;
      } else {
        chatHideMetadata = false;
        await setSetting("chat_hide_metadata", chatHideMetadata);
      }
    } else {
      chatHideMetadata = false;
      await setSetting("chat_hide_metadata", chatHideMetadata);
    }
  } catch(e) {
    console.error("Error loading chat_hide_metadata:", e);
    chatHideMetadata = false;
    await setSetting("chat_hide_metadata", chatHideMetadata);
  }

  try {
    const r4 = await fetch("/api/settings/show_subbubble_token_count");
    if(r4.ok){
      const { value } = await r4.json();
      showSubbubbleToken = !!value;
    } else {
      showSubbubbleToken = true;
      await setSetting("show_subbubble_token_count", showSubbubbleToken);
    }
  } catch(e) {
    console.error("Error loading show_subbubble_token_count:", e);
    showSubbubbleToken = true;
    await setSetting("show_subbubble_token_count", showSubbubbleToken);
  }

  await loadFileList();

  favElement = document.getElementById("favicon");
  if (favElement) {
    favElement.href = defaultFavicon;
  }

  // Sync hidden chat settings checkboxes with loaded values before saving
  $("#hideMetadataCheck").checked = chatHideMetadata;
  $("#autoNamingCheck").checked = chatTabAutoNaming;
  $("#subbubbleTokenCheck").checked = showSubbubbleToken;
  $("#sterlingUrlCheck").checked = sterlingChatUrlVisible;
  $("#chatStreamingCheck").checked = chatStreaming;
  $("#showMarkdownTasksCheck").checked = markdownPanelVisible;
  $("#enterSubmitCheck").checked = enterSubmitsMessage;
  $("#showNavMenuCheck").checked = navMenuVisible;

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
  if(!lastView) lastView = "chatTabs";
  switch(lastView){
    case "uploader": showUploaderPanel(); break;
    case "fileTree": showFileTreePanel(); break;
    case "chatTabs": showChatTabsPanel(); break;
    case "activity": showActivityIframePanel(); break;
    default: showChatTabsPanel(); break;
  }

  initChatScrollLoading();

  // Initialize model tabs
  initModelTabs();

  // -----------------------------------------------------------------------
  // Load the global markdown content on startup
  // -----------------------------------------------------------------------
  try {
    const mdResp = await fetch("/api/markdown");
    if(mdResp.ok){
      const mdData = await mdResp.json();
      $("#markdownInput").value = mdData.content || "";
    }
  } catch(e) {
    console.error("Error loading markdown content:", e);
  }
})();

function initChatScrollLoading(){
  const chatMessagesEl = document.getElementById("chatMessages");
  if(!chatMessagesEl) return;

  chatMessagesEl.addEventListener("scroll", async ()=>{
    if(chatMessagesEl.scrollTop < 50){
      if(chatHasMore){
        await loadChatHistory(currentTabId, false);
      }
    }
  });
}

let chatHistoryOffset = 0;
let chatHasMore = true;

async function loadChatHistory(tabId = 1, reset=false) {
  const chatMessagesEl = document.getElementById("chatMessages");
  if(reset){
    chatMessagesEl.innerHTML="";
    chatHistoryOffset = 0;
    chatHasMore = true;
  }
  try {
    const resp = await fetch(`/api/chat/history?tabId=${tabId}&limit=10&offset=${chatHistoryOffset}`);
    if(!resp.ok){
      console.error("Error loading chat history from server");
      return;
    }
    const data = await resp.json();
    const pairs = data.pairs || [];
    if(pairs.length<10){
      chatHasMore = false;
    }
    chatHistoryOffset += pairs.length;

    if(reset){
      for (const p of pairs) {
        addChatMessage(
            p.id, p.user_text, p.timestamp,
            p.ai_text, p.ai_timestamp,
            p.model, p.system_context, null, p.token_info
        );
      }
    } else {
      const scrollPos = chatMessagesEl.scrollHeight;
      const fragment = document.createDocumentFragment();
      for (let i = pairs.length-1; i>=0; i--){
        const p = pairs[i];
        const seqDiv = document.createElement("div");
        seqDiv.className = "chat-sequence";

        const userDiv = document.createElement("div");
        userDiv.className = "chat-user";
        {
          const userHead = document.createElement("div");
          userHead.className = "bubble-header";
          userHead.innerHTML = `
            <div class="name-oval name-oval-user">User</div>
            <span style="opacity:0.8;">${formatTimestamp(p.timestamp)}</span>
          `;
          userDiv.appendChild(userHead);

          const userBody = document.createElement("div");
          userBody.textContent = p.user_text;
          userDiv.appendChild(userBody);
        }

        if(p.token_info && showSubbubbleToken){
          try {
            const tInfo = JSON.parse(p.token_info);
            const inputT = (tInfo.systemTokens || 0) + (tInfo.historyTokens || 0) + (tInfo.inputTokens || 0);
            const outputT = (tInfo.assistantTokens || 0) + (tInfo.finalAssistantTokens || 0);

            userDiv._tokenSections = { input: inputT, output: outputT };
            const userTokenDiv = document.createElement("div");
            userTokenDiv.className = "token-indicator";
            userTokenDiv.textContent = `In: ${inputT}`;
            userDiv.appendChild(userTokenDiv);
          } catch (e) {
            console.debug("[Server Debug] Could not parse token_info for pair =>", p.id, e.message);
          }
        }

        seqDiv.appendChild(userDiv);

        const botDiv = document.createElement("div");
        botDiv.className = "chat-bot";

        const botHead = document.createElement("div");
        botHead.className = "bubble-header";

        const { provider, shortModel } = parseProviderModel(p.model);
        botHead.innerHTML = `
          <div class="name-oval name-oval-ai" title="${provider} / ${shortModel}">${window.agentName}</div>
          <span style="opacity:0.8;">${p.ai_timestamp ? formatTimestamp(p.ai_timestamp) : "…"}</span>
        `;
        botDiv.appendChild(botHead);

        const botBody = document.createElement("div");
        botBody.textContent = p.ai_text || "";
        botDiv.appendChild(botBody);

        if(p.token_info && showSubbubbleToken){
          try {
            const tInfo = JSON.parse(p.token_info);
            const outTokens = (tInfo.assistantTokens || 0) + (tInfo.finalAssistantTokens || 0);
            const combinedDiv = document.createElement("div");
            combinedDiv.className = "token-indicator";
            combinedDiv.textContent = `Out: ${outTokens} (Time: ${(tInfo.responseTime*10)?.toFixed(2) || "?"}s)`;
            botDiv.appendChild(combinedDiv);
          } catch(e){
            console.debug("[Server Debug] Could not parse token_info for prepended pair =>", e.message);
          }
        }

        seqDiv.appendChild(botDiv);
        fragment.appendChild(seqDiv);
      }
      if(chatMessagesEl.firstChild){
        chatMessagesEl.insertBefore(fragment, chatMessagesEl.firstChild);
      } else {
        chatMessagesEl.appendChild(fragment);
      }
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight - scrollPos;
    }
  } catch (err) {
    console.error("Error loading chat history:", err);
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
  }

  if(tokenInfo && showSubbubbleToken){
    try {
      const tInfo = JSON.parse(tokenInfo);
      const userInTokens = (tInfo.systemTokens||0) + (tInfo.historyTokens||0) + (tInfo.inputTokens||0);
      const userTokenDiv = document.createElement("div");
      userTokenDiv.className = "token-indicator";
      userTokenDiv.textContent = `In: ${userInTokens}`;
      userDiv.appendChild(userTokenDiv);
    } catch(e){
      console.debug("[Server Debug] Could not parse token_info for user subbubble =>", e.message);
    }
  }

  seqDiv.appendChild(userDiv);

  const botDiv = document.createElement("div");
  botDiv.className = "chat-bot";

  const botHead = document.createElement("div");
  botHead.className = "bubble-header";
  const { provider, shortModel } = parseProviderModel(model);
  botHead.innerHTML = `
    <div class="name-oval name-oval-ai" title="${provider} / ${shortModel}">${window.agentName}</div>
    <span style="opacity:0.8;">${aiTs ? formatTimestamp(aiTs) : "…"}</span>
  `;
  botDiv.appendChild(botHead);

  const botBody = document.createElement("div");
  botBody.textContent = aiText || "";
  botDiv.appendChild(botBody);

  if(tokenInfo && showSubbubbleToken){
    try {
      const tInfo = JSON.parse(tokenInfo);
      const outTokens = tInfo.finalAssistantTokens || 0;
      const combinedDiv = document.createElement("div");
      combinedDiv.className = "token-indicator";
      combinedDiv.textContent = `Out: ${outTokens} (Time: ${(tInfo.responseTime*10)?.toFixed(2) || "?"}s)`;
      botDiv.appendChild(combinedDiv);
    } catch(e){
      console.debug("[Server Debug] Could not parse token_info for pair =>", pairId, e.message);
    }
  }

  seqDiv.appendChild(botDiv);

  if(!chatHideMetadata){
    const metaContainer = document.createElement("div");
    metaContainer.style.fontSize = "0.8rem";
    metaContainer.style.color = "#aaa";
    metaContainer.style.textAlign = "right";

    const pairLabel = document.createElement("div");
    pairLabel.textContent = `Pair #${pairId}`;
    metaContainer.appendChild(pairLabel);

    if (model) {
      const modelLabel = document.createElement("div");
      modelLabel.textContent = `${provider} / ${model}`;
      metaContainer.appendChild(modelLabel);
    }

    let tokObj = null;
    try {
      tokObj = tokenInfo ? JSON.parse(tokenInfo) : null;
    } catch(e) {}

    if (systemContext) {
      const scDetails = document.createElement("details");
      const scSum = document.createElement("summary");
      if (tokObj && tokObj.systemTokens !== undefined) {
        scSum.textContent = `System Context (${tokObj.systemTokens})`;
      } else {
        scSum.textContent = `System Context`;
      }
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

    if (fullHistory) {
      const fhDetails = document.createElement("details");
      const fhSum = document.createElement("summary");
      fhSum.textContent = `Full History`;
      fhDetails.appendChild(fhSum);
      const fhPre = document.createElement("pre");
      fhPre.textContent = JSON.stringify(fullHistory, null, 2);
      fhDetails.appendChild(fhPre);
      metaContainer.appendChild(fhDetails);
    }

    if (tokObj) {
      const tuDetails = document.createElement("details");
      const tuSum = document.createElement("summary");
      tuSum.textContent = `Token Usage (${tokObj.total})`;
      tuDetails.appendChild(tuSum);

      const respTime = tokObj.responseTime*10;
      console.log('respTime: ' + respTime);

      const usageDiv = document.createElement("div");
      usageDiv.style.marginLeft = "1em";
      usageDiv.textContent =
          `System: ${tokObj.systemTokens}, ` +
          `History: ${tokObj.historyTokens}, ` +
          `Input: ${tokObj.inputTokens}, ` +
          `Assistant: ${tokObj.assistantTokens}, ` +
          `FinalAssistantTokens: ${tokObj.finalAssistantTokens}, ` +
          `Total: ${tokObj.total}, ` +
          `Time: ${respTime}s`;
      tuDetails.appendChild(usageDiv);
      metaContainer.appendChild(tuDetails);
    }

    const directLinkDiv = document.createElement("div");
    const ddLink = document.createElement("a");
    ddLink.href = `/pair/${pairId}`;
    ddLink.target = "_blank";
    ddLink.textContent = "Direct Link";
    directLinkDiv.appendChild(ddLink);
    metaContainer.appendChild(directLinkDiv);

    seqDiv.appendChild(metaContainer);
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

// New model tabs logic
async function initModelTabs() {
  try {
    // load from DB setting
    let mTabs = await getSetting("model_tabs");
    if(!Array.isArray(mTabs)) mTabs = [];
    modelTabs = mTabs;
    let lastModelTab = await getSetting("last_model_tab");
    if(typeof lastModelTab !== "number" && modelTabs.length>0){
      lastModelTab = modelTabs[0].id;
    }
    currentModelTabId = lastModelTab || null;
    renderModelTabs();
  } catch(e){
    console.error("Error init model tabs:", e);
  }
  const newModelTabBtn = document.getElementById("newModelTabBtn");
  if(newModelTabBtn){
    newModelTabBtn.addEventListener("click", addModelTab);
  }
}

function renderModelTabs(){
  const container = document.getElementById("modelTabsContainer");
  if(!container) return;
  container.innerHTML = "";
  modelTabs.forEach(tab => {
    const b = document.createElement("div");
    b.style.padding="4px 6px";
    b.style.cursor="pointer";
    b.style.border= (tab.id===currentModelTabId) ? "2px solid #aaa" : "1px solid #444";
    b.style.backgroundColor= (tab.id===currentModelTabId) ? "#555" : "#333";
    b.style.color= (tab.id===currentModelTabId) ? "#fff" : "#ddd";
    b.style.display = "inline-flex";
    b.style.alignItems = "center";
    b.style.gap = "6px";

    // Title or name
    const labelSpan = document.createElement("span");
    labelSpan.textContent = tab.name;
    b.appendChild(labelSpan);

    // Service selector
    const serviceSelect = document.createElement("select");
    ["openai","openrouter","deepseek"].forEach(sv => {
      const opt = document.createElement("option");
      opt.value = sv;
      opt.textContent = sv;
      serviceSelect.appendChild(opt);
    });
    serviceSelect.value = tab.service || "openai";
    serviceSelect.addEventListener("change", async (evt)=>{
      tab.service = evt.target.value;
      await saveModelTabs();
    });
    b.appendChild(serviceSelect);

    // Click => select this tab
    b.addEventListener("click", (ev)=>{
      if(ev.target===serviceSelect) return;
      selectModelTab(tab.id);
    });

    // Right-click => rename or delete
    b.addEventListener("contextmenu", e=>{
      e.preventDefault();
      const choice=prompt("Type 'rename' or 'delete':","");
      if(choice==="rename") renameModelTab(tab.id);
      else if(choice==="delete") deleteModelTab(tab.id);
    });

    container.appendChild(b);
  });
}

// Add a new model tab
async function addModelTab(){
  let name = prompt("Enter Model Tab Name (e.g., GPT-4 or deepseek-latest):", "");
  if(!name) return;
  let newId = 1;
  if(modelTabs.length>0){
    const maxId = Math.max(...modelTabs.map(t=>t.id));
    newId = maxId+1;
  }
  const newObj = {
    id: newId,
    name,
    modelId: name,
    service: "openai"
  };
  modelTabs.push(newObj);
  currentModelTabId = newId;
  await saveModelTabs();
  await setSetting("ai_model", name);
  modelName = name;
  renderModelTabs();
}

// rename model tab
async function renameModelTab(tabId){
  const t = modelTabs.find(t => t.id===tabId);
  if(!t) return;
  const newName = prompt("Enter new model name:", t.name || "Unnamed");
  if(!newName) return;
  t.name = newName;
  t.modelId = newName;
  await saveModelTabs();
  if(tabId===currentModelTabId){
    await setSetting("ai_model", newName);
    modelName = newName;
  }
  renderModelTabs();
}

// delete model tab
async function deleteModelTab(tabId){
  if(!confirm("Delete this model tab?")) return;
  const idx = modelTabs.findIndex(x=>x.id===tabId);
  if(idx<0) return;
  modelTabs.splice(idx,1);
  if(currentModelTabId===tabId){
    currentModelTabId = modelTabs.length>0 ? modelTabs[0].id : null;
    if(currentModelTabId){
      const t = modelTabs.find(m=>m.id===currentModelTabId);
      if(t) {
        await setSetting("ai_model", t.modelId);
        modelName = t.modelId;
      }
    } else {
      await setSetting("ai_model","");
      modelName = "unknown";
    }
  }
  await saveModelTabs();
  renderModelTabs();
}

// select model tab
async function selectModelTab(tabId){
  currentModelTabId = tabId;
  const t = modelTabs.find(x=>x.id===tabId);
  if(t){
    await setSetting("ai_model", t.modelId);
    modelName = t.modelId;
  }
  await setSetting("last_model_tab", tabId);
  renderModelTabs();
}

async function saveModelTabs(){
  await setSetting("model_tabs", modelTabs);
}

document.getElementById("toggleModelTabsBtn").addEventListener("click", async () => {
  const cont = document.getElementById("modelTabsContainer");
  const newBtn = document.getElementById("newModelTabBtn");
  const toggleBtn = document.getElementById("toggleModelTabsBtn");
  if(modelTabsBarVisible){
    if(cont) cont.style.display = "none";
    if(newBtn) newBtn.style.display = "none";
    toggleBtn.textContent = "Model";
    modelTabsBarVisible = false;
    await setSetting("model_tabs_bar_visible", false);
  } else {
    if(cont) cont.style.display = "";
    if(newBtn) newBtn.style.display = "";
    toggleBtn.textContent = "Hide model tabs bar";
    modelTabsBarVisible = true;
    await setSetting("model_tabs_bar_visible", true);
  }
});

// ----------------------------------------------------------------------
// NEW: "Change Sterling Branch" button event + modal logic
// ----------------------------------------------------------------------
document.getElementById("changeSterlingBranchBtn").addEventListener("click", () => {
  showModal($("#changeBranchModal"));
});

// Cancel button for branch
document.getElementById("sterlingBranchCancelBtn").addEventListener("click", () => {
  hideModal($("#changeBranchModal"));
});

// Save button for branch
document.getElementById("sterlingBranchSaveBtn").addEventListener("click", async () => {
  const createNew = $("#createSterlingNewBranchCheck").checked;
  const branchName = $("#sterlingBranchNameInput").value.trim();
  const msgElem = $("#sterlingBranchMsg");
  msgElem.textContent = "";

  if(!branchName){
    msgElem.textContent = "Please enter a branch name.";
    return;
  }

  try {
    let project = await getSetting("sterling_project");
    if(!project) {
      msgElem.textContent = "No sterling_project is set. Please set a project first.";
      return;
    }
    await fetch("/api/projectBranches", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ data: [{
        project,
        base_branch: branchName
      }]})
    });
    hideModal($("#changeBranchModal"));
    msgElem.textContent = "";
    await updateProjectInfo();
    alert(`Sterling branch changed to "${branchName}" (createNew=${createNew}).`);
  } catch(err){
    console.error("Error changing sterling branch:", err);
    msgElem.textContent = "Error: " + err.message;
  }
});

// ----------------------------------------------------------------------
// Added click events for the “Markdown Menu” gear icon
// ----------------------------------------------------------------------
document.getElementById("markdownGearIcon").addEventListener("click", async () => {
  try {
    const r = await fetch("/api/settings/taskList_git_ssh_url");
    if(r.ok){
      const { value } = await r.json();
      document.getElementById("mdMenuRepoInput").value = value || "";
    }
    const rp = await fetch("/api/tasklist/repo-path");
    if(rp.ok){
      const { path } = await rp.json();
      document.getElementById("mdMenuRepoPath").textContent = path ? `Local repo: ${path}` : "Repo not cloned";
    } else {
      document.getElementById("mdMenuRepoPath").textContent = "Repo not cloned";
    }
  } catch(e){
    console.error("Error loading taskList_git_ssh_url:", e);
  }
  showModal(document.getElementById("mdMenuModal"));
});
document.getElementById("mdMenuSaveBtn").addEventListener("click", async () => {
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({key: "taskList_git_ssh_url", value: document.getElementById("mdMenuRepoInput").value})
    });
  } catch(e){
    console.error("Error saving taskList_git_ssh_url:", e);
  }
  hideModal(document.getElementById("mdMenuModal"));
});
document.getElementById("mdMenuUpdateBtn").addEventListener("click", async () => {
  try {
    const content = document.getElementById("markdownInput").value;
    const resp = await fetch("/api/markdown", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ content })
    });
    if(!resp.ok){
      alert("Error updating markdown.");
      return;
    }
    alert("Markdown updated and pushed.");
  } catch(e){
    console.error("Error updating markdown:", e);
    alert("Unable to update markdown.");
  }
});
document.getElementById("mdMenuCloseBtn").addEventListener("click", () => {
  hideModal(document.getElementById("mdMenuModal"));
});

// ----------------------------------------------------------------------
// New Task List Configuration modal
// ----------------------------------------------------------------------
document.getElementById("gearBtn").addEventListener("click", () => {
  showModal(document.getElementById("taskListConfigModal"));
});
document.getElementById("taskListConfigCloseBtn").addEventListener("click", () => {
  hideModal(document.getElementById("taskListConfigModal"));
});

// ----------------------------------------------------------------------
// Handling the global markdown save button
// ----------------------------------------------------------------------
document.getElementById("saveMdBtn").addEventListener("click", async () => {
  try {
    const content = $("#markdownInput").value;
    const resp = await fetch("/api/markdown", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ content })
    });
    if(!resp.ok){
      alert("Error saving markdown content.");
      return;
    }
    alert("Markdown content saved.");
  } catch(e) {
    console.error("Error saving markdown:", e);
    alert("Unable to save markdown content.");
  }
});

/*
  Image button now simply populates a buffer and displays a preview.
*/
document.getElementById("chatImageBtn").addEventListener("click", () => {
  document.getElementById("imageUploadInput").click();
});

document.getElementById("imageUploadInput").addEventListener("change", async (ev) => {
  const files = ev.target.files;
  if(!files || files.length===0) return;
  for(const f of files){
    pendingImages.push(f);
  }
  updateImagePreviewList();
  ev.target.value="";
});

/*
  Show a small list of “buffered” images that will attach with the next message.
*/
function updateImagePreviewList(){
  const previewArea = document.getElementById("imagePreviewArea");
  if(!previewArea) return;
  previewArea.innerHTML = "";
  if(pendingImages.length===0){
    previewArea.innerHTML = "<em>No images selected</em>";
    return;
  }
  pendingImages.forEach((f, idx) => {
    const div = document.createElement("div");
    div.style.marginBottom="4px";
    div.textContent = f.name;
    const rmBtn = document.createElement("button");
    rmBtn.textContent = "Remove";
    rmBtn.style.marginLeft="8px";
    rmBtn.addEventListener("click", () => {
      pendingImages.splice(idx,1);
      updateImagePreviewList();
    });
    div.appendChild(rmBtn);
    previewArea.appendChild(div);
  });
}

console.log("[Server Debug] main.js fully loaded. End of script.");
