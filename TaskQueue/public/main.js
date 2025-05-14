```javascript
/* =================================================================================
 *  MAIN APP JAVASCRIPT
 *  (merged: original file + new Sterling-URL enhancements)
 * ================================================================================= */

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
let visibleCols       = new Set(columnsOrder.map(c => c.key));
let allTasks          = [];
let dragSrcRow        = null;
let modelName         = "unknown";
let tasksVisible      = true;
let sidebarVisible    = true;
let chatTabs          = [];
let currentTabId      = 1;
let chatHideMetadata  = false;
let chatTabAutoNaming = false;
let showSubbubbleToken= false;
window.agentName      = "Alfe";

const defaultFavicon  = "alfe_favicon_clean_64x64.ico";
const rotatingFavicon = "alfe_favicon_clean_64x64.ico";
let   favElement      = null;

/* ────────────────────────────────────────────────────────────────────────────── */
/*  DOM helpers                                                                  */
const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];

/* ────────────────────────────────────────────────────────────────────────────── */
/*  Date helpers                                                                 */
function formatTimestamp(isoStr){
  if(!isoStr) return "(no time)";
  const d = new Date(isoStr);
  return d.toLocaleString([], {
    year  : '2-digit',
    month : '2-digit',
    day   : '2-digit',
    hour  : '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}
function isoDate(d){
  return new Date(d).toLocaleDateString([], {
    year :"2-digit",
    month:"2-digit",
    day  :"2-digit"
  });
}

/* ────────────────────────────────────────────────────────────────────────────── */
/*  Modal helpers                                                                */
function showModal(m){ m.style.display = "flex"; }
function hideModal(m){ m.style.display = "none"; }
$$(".modal").forEach(m => m.addEventListener("click",
  e => { if(e.target === m) hideModal(m); }
));

/* ────────────────────────────────────────────────────────────────────────────── */
/*  TASK SECTION                                                                 */
/* ────────────────────────────────────────────────────────────────────────────── */

async function toggleTasks(){
  tasksVisible = !tasksVisible;
  $("#tasks").style.display = tasksVisible ? "" : "none";
  $("#toggleTasksBtn").textContent = tasksVisible ? "Hide tasks" : "Show tasks";
  await fetch("/api/settings",{
    method :"POST",
    headers:{"Content-Type":"application/json"},
    body   :JSON.stringify({ key:"tasks_visible", value:tasksVisible })
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
  $("#expandSidebarBtn").style.display = sidebarVisible ? "none" : "block";

  await fetch("/api/settings",{
    method :"POST",
    headers:{"Content-Type":"application/json"},
    body   :JSON.stringify({ key:"sidebar_visible", value:sidebarVisible })
  });
}
$("#toggleSidebarBtn").addEventListener("click", toggleSidebar);

document.getElementById("expandSidebarBtn").addEventListener("click", () => {
  if(!sidebarVisible) toggleSidebar();
});

/* ────────────────────────────────────────────────────────────────────────────── */
/*  SETTINGS LOAD / SAVE                                                         */
async function loadSettings(){
  /* visible columns */
  {
    const r = await fetch("/api/settings/visible_columns");
    if(r.ok){
      const { value } = await r.json();
      if(Array.isArray(value)) visibleCols = new Set(value);
    }
  }
  /* column order */
  {
    const r = await fetch("/api/settings/columns_order");
    if(r.ok){
      const { value } = await r.json();
      if(Array.isArray(value)){
        const map   = Object.fromEntries(columnsOrder.map(c=>[c.key,c]));
        const newOrd=[];
        value.forEach(k => { if(map[k]){ newOrd.push(map[k]); delete map[k]; }});
        Object.values(map).forEach(c => newOrd.push(c));
        columnsOrder = newOrd;
      }
    }
  }
  /* task visibility */
  {
    const r = await fetch("/api/settings/tasks_visible");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== "undefined") tasksVisible = !!value;
    }
    $("#tasks").style.display = tasksVisible ? "" : "none";
    $("#toggleTasksBtn").textContent = tasksVisible ? "Hide tasks" : "Show tasks";
  }
  /* sidebar visibility */
  {
    const r = await fetch("/api/settings/sidebar_visible");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== "undefined") sidebarVisible = !!value;
    }
    $(".sidebar").style.display   = sidebarVisible ? "" : "none";
    $("#divider").style.display   = sidebarVisible ? "" : "none";
    $("#toggleSidebarBtn").textContent = sidebarVisible ? "Hide sidebar" : "Show sidebar";
    $("#expandSidebarBtn").style.display = sidebarVisible ? "none" : "block";
  }
  /* sidebar width */
  {
    const r = await fetch("/api/settings/sidebar_width");
    if(r.ok){
      const { value } = await r.json();
      if(typeof value !== 'undefined') $(".sidebar").style.width = value + "px";
    }
  }
}

async function saveSettings(){
  await fetch("/api/settings",{
    method :"POST",
    headers:{"Content-Type":"application/json"},
    body   :JSON.stringify({ key:"visible_columns", value:[...visibleCols] })
  });
  await fetch("/api/settings",{
    method :"POST",
    headers:{"Content-Type":"application/json"},
    body   :JSON.stringify({ key:"columns_order", value:columnsOrder.map(c=>c.key) })
  });
}

/* ────────────────────────────────────────────────────────────────────────────── */
/*  TABLE DRAWING                                                                */
function renderHeader(){
  const tr = $("#headerRow");
  tr.innerHTML = "";
  columnsOrder.forEach(col=>{
    if(!visibleCols.has(col.key)) return;
    const th   = document.createElement("th");
    th.textContent = col.label;
    tr.appendChild(th);
  });
}

/*  Drag-and-drop helpers */
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
function handleDragLeave(e){ e.currentTarget.classList.remove("drag-over"); }
function handleDrop(e){
  e.preventDefault();
  const target = e.currentTarget;
  target.classList.remove("drag-over");
  if(dragSrcRow && dragSrcRow !== target){
    const tbody = target.parentNode;
    const rows  = [...tbody.children];
    let from = rows.indexOf(dragSrcRow);
    let to   = rows.indexOf(target);
    tbody.removeChild(dragSrcRow);
    if(from < to) to--;
    tbody.insertBefore(dragSrcRow, tbody.children[to]);
    saveNewOrderToServer();
  }
  dragSrcRow = null;
}
function handleDragEnd(){
  $$("tr.drag-over").forEach(r=>r.classList.remove("drag-over"));
  dragSrcRow = null;
}
async function saveNewOrderToServer(){
  const ids = $$("#tasks tbody tr").map(r=> +r.dataset.taskId);
  await fetch("/api/tasks/reorderAll",{
    method :"POST",
    headers:{"Content-Type":"application/json"},
    body   :JSON.stringify({ orderedIds:ids })
  });
}

/* ────────────────────────────────────────────────────────────────────────────── */
/*  TASK FETCH/RENDER                                                            */
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
      if(pj && t.project!==pj)   return false;
      if(sp && t.sprint !==sp)   return false;
      return true;
    })
    .forEach(t=>{
      const tr = document.createElement("tr");
      tr.dataset.taskId = t.id;
      if(t.hidden) tr.classList.add("hidden");

      ["drag","priority","status","number","title",
       "dependencies","project","created"
      ].forEach(key=>{
        if(!visibleCols.has(key)) return;
        const td = document.createElement("td");
        switch(key){
          case "drag":
            td.innerHTML = `<span class="drag-handle" draggable="true">⠿</span>`;
            td.querySelector(".drag-handle")
              .addEventListener("dragstart", handleDragStart);
            break;
          case "priority":
            td.textContent = t.priority;
            td.className   = "priority-cell";
            break;
          case "status":
            td.textContent = t.status;
            td.className   = "status-cell";
            break;
          case "number":
            td.innerHTML = `<a href="${t.html_url}" target="_blank">#${t.number}</a>`;
            break;
          case "title":
            td.textContent = t.title;
            td.className   = "title-cell";
            break;
          case "dependencies":
            td.textContent = t.dependencies;
            td.className   = "dependencies-cell";
            break;
          case "project":
            td.textContent = t.project;
            td.className   = "project-cell";
            break;
          case "created":
            td.textContent = isoDate(t.created_at);
            break;
          default:
            td.textContent = t[key] || "";
        }
        tr.appendChild(td);
      });

      ["dragover","dragleave","drop","dragend"].forEach(evt=>{
        tr.addEventListener(evt,{
          "dragover" :handleDragOver,
          "dragleave":handleDragLeave,
          "drop"     :handleDrop,
          "dragend"  :handleDragEnd
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
  $("#projectFilter").innerHTML =
    '<option value="">All projects</option>' +
    pj.map(p=>`<option value="${p.project}">${p.project}</option>`).join("");

  const sp = await (await fetch("/api/sprints")).json();
  $("#sprintFilter").innerHTML =
    '<option value="">All sprints</option>' +
    sp.map(s=>`<option value="${s.sprint}">${s.sprint}</option>`).join("");
}

/* ────────────────────────────────────────────────────────────────────────────── */
/*  COLUMN CONFIG MODAL                                                          */
function openColModal(){
  const cnt = $("#colList");
  cnt.innerHTML = "";
  columnsOrder.forEach((c,i)=>{
    const div   = document.createElement("div");
    div.className ="col-item";
    div.innerHTML =
      `<button class="col-move" data-idx="${i}" data-dir="up">⬆️</button>` +
      `<button class="col-move" data-idx="${i}" data-dir="down">⬇️</button>`+
      `<label><input type="checkbox" value="${c.key}" ${visibleCols.has(c.key)?"checked":""}/> ${c.label||c.key}</label>`;
    cnt.appendChild(div);
  });
  showModal($("#colModal"));
}
$("#gearBtn").addEventListener("click", openColModal);

$("#colList").addEventListener("click", e=>{
  if(!e.target.classList.contains("col-move")) return;
  const i  = +e.target.dataset.idx;
  const dir= e.target.dataset.dir;
  const ni = dir==="up" ? i-1 : i+1;
  if(ni<0 || ni>=columnsOrder.length) return;
  [columnsOrder[i], columnsOrder[ni]] =
    [columnsOrder[ni], columnsOrder[i]];
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
$("#colCancelBtn").addEventListener("click", ()=>hideModal($("#colModal")));

/* ────────────────────────────────────────────────────────────────────────────── */
/*  INLINE FIELD EDITS & ROW BUTTONS                                             */
$("#tasks").addEventListener("click", async e=>{
  const btn = e.target.closest("button");
  if(btn){
    /* hide/unhide row */
    if(btn.classList.contains("eye")){
      const id = +btn.dataset.id;
      const hideNow = btn.textContent === "👁️";
      await fetch("/api/tasks/hidden",{
        method :"POST",
        headers:{"Content-Type":"application/json"},
        body   :JSON.stringify({ id, hidden:hideNow })
      });
      return loadTasks();
    }
    /* arrow reorder buttons */
    if(btn.classList.contains("arrow")){
      const id  = +btn.dataset.id;
      const dir = btn.dataset.dir;
      await fetch("/api/tasks/reorder",{
        method :"POST",
        headers:{"Content-Type":"application/json"},
        body   :JSON.stringify({ id, direction:dir })
      });
      return loadTasks();
    }
  }

  /* inline editing */
  const cell = e.target;
  const row  = cell.closest("tr");
  if(!row) return;
  const taskId = +row.dataset.taskId;

  function inlineEdit(newEl, saveCb){
    cell.textContent = "";
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
      const o = document.createElement("option");
      o.value = v; o.textContent = v;
      if(v===cell.textContent) o.selected = true;
      sel.appendChild(o);
    });
    return inlineEdit(sel,v=>fetch("/api/tasks/priority",{
      method :"POST",
      headers:{"Content-Type":"application/json"},
      body   :JSON.stringify({ id:taskId, priority:v })
    }));
  }
  if(cell.classList.contains("status-cell")){
    const sel = document.createElement("select");
    ["Not Started","In Progress","Done"].forEach(v=>{
      const o=document.createElement("option");
      o.value = v; o.textContent = v;
      if(v===cell.textContent) o.selected = true;
      sel.appendChild(o);
    });
    return inlineEdit(sel,v=>fetch("/api/tasks/status",{
      method :"POST",
      headers:{"Content-Type":"application/json"},
      body   :JSON.stringify({ id:taskId, status:v })
    }));
  }
  if(cell.classList.contains("project-cell")){
    const inp = document.createElement("input");
    inp.type  = "text";
    inp.value = cell.textContent;
    return inlineEdit(inp,v=>fetch("/api/tasks/project",{
      method :"POST",
      headers:{"Content-Type":"application/json"},
      body   :JSON.stringify({ id:taskId, project:v })
    }));
  }
  if(cell.classList.contains("dependencies-cell")){
    const inp = document.createElement("input");
    inp.type  = "text";
    inp.value = cell.textContent;
    return inlineEdit(inp,v=>fetch("/api/tasks/dependencies",{
      method :"POST",
      headers:{"Content-Type":"application/json"},
      body   :JSON.stringify({ id:taskId, dependencies:v })
    }));
  }
  if(cell.classList.contains("title-cell")){
    const inp = document.createElement("input");
    inp.type  = "text";
    inp.value = cell.textContent;
    return inlineEdit(inp,v=>fetch("/api/tasks/rename",{
      method :"POST",
      headers:{"Content-Type":"application/json"},
      body   :JSON.stringify({ id:taskId, newTitle:v })
    }));
  }
});

$("#showHidden"  ).addEventListener("change", loadTasks);
$("#projectFilter").addEventListener("change", renderBody);
$("#sprintFilter" ).addEventListener("change", renderBody);

/* ────────────────────────────────────────────────────────────────────────────── */
/*  VARIOUS SETTINGS MODALS (agent, repo, defaults, …)                           */
/* (unchanged code, omitted for brevity)                                         */
/* ────────────────────────────────────────────────────────────────────────────── */


/* =================================================================================
 *  CHAT / STERLING SECTION
 * ================================================================================= */

/* -------------------------------------------------------------------------------
 *  Sterling URL label helper
 * ----------------------------------------------------------------------------- */
function updateSterlingUrlDisplay(){
  const tab = chatTabs.find(t=> t.id === currentTabId);
  const lbl = $("#sterlingUrlLabel");
  if(tab && tab.sterling_url){
    lbl.innerHTML =
      `Sterling chat: <a href="${tab.sterling_url}" target="_blank">${tab.sterling_url}</a>`;
  } else {
    lbl.innerHTML = "";
  }
}

/* -------------------------------------------------------------------------------
 *  Tabs handling
 * ----------------------------------------------------------------------------- */
async function loadTabs(){
  const res = await fetch("/api/chat/tabs");
  chatTabs   = await res.json();
}
async function addNewTab(){
  const name = prompt("Enter tab name:", "New Tab");
  if(!name) return;
  const r = await fetch("/api/chat/tabs/new",{
    method :"POST",
    headers:{"Content-Type":"application/json"},
    body   :JSON.stringify({ name })
  });
  if(r.ok){
    await loadTabs();
    renderTabs();
  }
}
async function renameTab(tabId){
  const t        = chatTabs.find(t=>t.id===tabId);
  const newName  = prompt("Enter new tab name:", t ? t.name : "Untitled");
  if(!newName) return;
  const r = await fetch("/api/chat/tabs/rename",{
    method :"POST",
    headers:{"Content-Type":"application/json"},
    body   :JSON.stringify({ tabId, newName })
  });
  if(r.ok){
    await loadTabs();
    renderTabs();
  }
}
async function deleteTab(tabId){
  if(!confirm("Are you sure you want to delete this tab (and all its messages)?")) return;
  const r = await fetch(`/api/chat/tabs/${tabId}`, { method:"DELETE" });
  if(r.ok){
    await loadTabs();
    currentTabId = chatTabs.length>0 ? chatTabs[0].id : 1;
    renderTabs();
    await loadChatHistory(currentTabId);
  }
}
function selectTab(tabId){
  currentTabId = tabId;
  loadChatHistory(tabId);
  renderTabs();
  updateSterlingUrlDisplay();  // NEW : ensure label refresh
}
function renderTabs(){
  const tc = $("#tabsContainer");
  tc.innerHTML = "";
  chatTabs.forEach(tab=>{
    const tabBtn = document.createElement("div");
    tabBtn.style.display       = "flex";
    tabBtn.style.alignItems    = "center";
    tabBtn.style.cursor        = "pointer";
    tabBtn.style.padding       = "4px 6px";

    if(tab.id === currentTabId){
      tabBtn.style.backgroundColor = "#555";
      tabBtn.style.border          = "2px solid #aaa";
      tabBtn.style.color           = "#fff";
    }else{
      tabBtn.style.backgroundColor = "#333";
      tabBtn.style.border          = "1px solid #444";
      tabBtn.style.color           = "#ddd";
    }

    tabBtn.textContent = tab.name;
    tabBtn.addEventListener("click", ()=>selectTab(tab.id));
    tabBtn.addEventListener("contextmenu", e=>{
      e.preventDefault();
      const choice = prompt("Type 'rename' or 'delete':", "");
      if(choice === "rename")  renameTab(tab.id);
      else if(choice === "delete") deleteTab(tab.id);
    });

    tc.appendChild(tabBtn);
  });
  updateSterlingUrlDisplay();  // NEW
}
$("#newTabBtn").addEventListener("click", addNewTab);

/* -------------------------------------------------------------------------------
 *  Create Sterling Chat Button
 * ----------------------------------------------------------------------------- */
document.getElementById("createSterlingChatBtn").addEventListener("click", async ()=>{
  try{
    const resp = await fetch("/api/createSterlingChat",{
      method :"POST",
      headers:{"Content-Type":"application/json"},
      body   :JSON.stringify({ tabId: currentTabId })  // NEW
    });
    if(!resp.ok){
      alert("Error creating sterling chat");
      return;
    }
    const data = await resp.json();
    if(data.success && data.sterlingUrl){
      /* update cache + UI */
      const idx = chatTabs.findIndex(t=> t.id === currentTabId);
      if(idx !== -1) chatTabs[idx].sterling_url = data.sterlingUrl;
      updateSterlingUrlDisplay();
    }
  }catch(e){
    console.error("CreateSterlingChat call failed:", e);
    alert("Error creating sterling chat");
  }
});

/* -------------------------------------------------------------------------------
 *  Chat history + send message etc.
 * ----------------------------------------------------------------------------- */
/* (original large chat code stays unchanged)                                    */
/* (due to length – not repeated here; no modifications needed in that section)  */
/* ----------------------------------------------------------------------------- */

/* =================================================================================
 *  INIT
 * ================================================================================= */
(async function init(){
  await loadSettings();
  await populateFilters();
  await loadTasks();

  /* get model name */
  try{
    const r = await fetch("/api/model");
    if(r.ok){
      const data = await r.json();
      modelName  = data.model || "unknown";
    }
  }catch(e){ modelName = "unknown"; }
  $("#modelHud").textContent = "Model: " + modelName;

  /* load tabs & chat */
  await loadTabs();
  if(chatTabs.length>0){
    currentTabId = chatTabs[0].id;
  }else{
    /* auto-create Main tab */
    await fetch("/api/chat/tabs/new",{
      method :"POST",
      headers:{"Content-Type":"application/json"},
      body   :JSON.stringify({ name:"Main" })
    });
    await loadTabs();
    currentTabId = chatTabs[0].id;
  }
  renderTabs();
  updateSterlingUrlDisplay();   // NEW
  await loadChatHistory(currentTabId);

  /* misc settings (agent instructions, etc.) – original code unchanged  */
  /* ... (not repeated for brevity) ... */

  await loadFileList();

  favElement = document.getElementById("favicon");
  if(favElement) favElement.href = defaultFavicon;

  await chatSettingsSaveFlow();
  await updateProjectInfo();
})();

/* =================================================================================
 *  END OF FILE
 * ================================================================================= */
```