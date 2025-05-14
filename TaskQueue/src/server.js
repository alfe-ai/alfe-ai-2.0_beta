[... earlier code unchanged ...]
// New endpoint for "Create Sterling Chat" with single response
app.post("/api/createSterlingChat", async (req, res) => {
  db.logActivity("Create Sterling Chat", "User triggered createSterlingChat endpoint.");

  try {
    const chatTabId = req.body.tabId || 1;   // NEW — which chat tab to save into

    const baseURL = 'http://localhost:3444/api';
    const project = db.getSetting("sterling_project") || "alfe-dev_test_repo";
    const projectName = "aurora_working-" + project;

    const createChatResponse = await axios.post(`${baseURL}/createChat`, {
      repoName: projectName
    });

    const newChatNum = createChatResponse.data.newChatNumber;
    const sterlingUrl = `http://localhost:3444/${encodeURIComponent(projectName)}/chat/${newChatNum}`;

    // Save to DB (NEW)
    db.setChatTabSterlingUrl(chatTabId, sterlingUrl);

    const updatedTab = db.getChatTab(chatTabId);

    res.json({
      success: true,
      sterlingUrl,
      tab: updatedTab
    });
  } catch (error) {
    console.error('Error during createSterlingChat:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
[... rest of server.js unchanged ...]
