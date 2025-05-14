let columnsOrder = [
  // ... [Rest of your existing code] ...
];

(async function init(){
  // ... [Rest of your existing initialization code] ...

  await chatSettingsSaveFlow();
  await updateProjectInfo();
})();

// ... [Rest of your existing code] ...

$("#chatSettingsBtn").addEventListener("click", async () => {
  // ... [Existing settings fetch code] ...

  // Fetch available AI providers and models
  const r4 = await fetch("/api/ai/providers");
  if (r4.ok) {
    const { providers, selectedProvider } = await r4.json();
    const aiProviderSelect = $("#aiProvider");
    aiProviderSelect.innerHTML = '';
    providers.forEach(provider => {
      const option = document.createElement("option");
      option.value = provider;
      option.textContent = provider;
      if (provider === selectedProvider) option.selected = true;
      aiProviderSelect.appendChild(option);
    });
  }

  const r5 = await fetch("/api/ai/models");
  if (r5.ok) {
    const { models, selectedModel } = await r5.json();
    const aiModelSelect = $("#aiModel");
    aiModelSelect.innerHTML = '';
    models.forEach(model => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      if (model === selectedModel) option.selected = true;
      aiModelSelect.appendChild(option);
    });
  }

  $("#hideMetadataCheck").checked = chatHideMetadata;
  $("#autoNamingCheck").checked = chatTabAutoNaming;
  $("#subbubbleTokenCheck").checked = showSubbubbleToken;
  showModal($("#chatSettingsModal"));
});

async function chatSettingsSaveFlow() {
  chatHideMetadata = $("#hideMetadataCheck").checked;
  chatTabAutoNaming = $("#autoNamingCheck").checked;
  showSubbubbleToken = $("#subbubbleTokenCheck").checked;

  const selectedProvider = $("#aiProvider").value;
  const selectedModel = $("#aiModel").value;

  await fetch("/api/ai/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: selectedProvider, model: selectedModel })
  });

  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "chat_hide_metadata", value: chatHideMetadata })
  });
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "chat_tab_auto_naming", value: chatTabAutoNaming })
  });
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "show_subbubble_token_count", value: showSubbubbleToken })
  });

  hideModal($("#chatSettingsModal"));
  await loadChatHistory(currentTabId);
}

$("#aiProvider").addEventListener("change", async () => {
  const selectedProvider = $("#aiProvider").value;
  const r = await fetch(`/api/ai/models?provider=${encodeURIComponent(selectedProvider)}`);
  if (r.ok) {
    const { models } = await r.json();
    const aiModelSelect = $("#aiModel");
    aiModelSelect.innerHTML = '';
    models.forEach(model => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      aiModelSelect.appendChild(option);
    });
  }
});
