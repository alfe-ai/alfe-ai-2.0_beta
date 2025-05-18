#!/bin/bash
# ... [Previous content remains unchanged up to /api/ai/models endpoint] ...

app.get("/api/ai/models", async (req, res) => {
  console.debug("[Server Debug] GET /api/ai/models called.");

  const knownTokenLimits = {
    "openai/codex-mini": 200000,
    "openai/codex-mini-latest": 200000,
    "openai/o4-mini-high": 200000,
    "openai/o3": 200000,
    "openai/o4-mini": 200000,
    "openai/gpt-4.1": 1047576,
    "openai/gpt-4.1-mini": 1047576,
    "openai/gpt-4.1-nano": 1047576,
    "openai/o1-pro": 200000,
    "openai/gpt-4o-mini-search-preview": 128000,
    "openai/gpt-4o-search-preview": 128000,
    "openai/gpt-4.5-preview": 128000,
    "openai/o3-mini-high": 200000,
    "openai/o3-mini": 200000,
    "openai/o1": 200000,
    "openai/gpt-4o-2024-11-20": 128000,
    "openai/o1-preview": 128000,
    "openai/o1-preview-2024-09-12": 128000,
    "openai/o1-mini": 128000,
    "openai/o1-mini-2024-09-12": 128000,
    "openai/chatgpt-4o-latest": 128000,
    "openai/gpt-4o-2024-08-06": 128000,
    "openai/gpt-4o-mini": 128000,
    "openai/gpt-4o-mini-2024-07-18": 128000,
    "openai/gpt-4o": 128000,
    "openai/gpt-4o:extended": 128000,
    "openai/gpt-4o-2024-05-13": 128000,
    "openai/gpt-4-turbo": 128000,
    "openai/gpt-4-turbo-preview": 128000,
    "openai/gpt-3.5-turbo-1106": 16385,
    "openai/gpt-3.5-turbo-instruct": 4095,
    "openai/gpt-3.5-turbo-16k": 16385,
    "openai/gpt-4-32k": 32767,
    "openai/gpt-4-32k-0314": 32767,
    "openai/gpt-3.5-turbo": 16385,
    "openai/gpt-3.5-turbo-0125": 16385,
    "openai/gpt-4": 8191,
    "openai/gpt-4-0314": 8191,
    "openrouter/codex-mini": 200000,
    "openrouter/gpt-4.1": "N/A",
    "openrouter/gpt-3.5-turbo": "N/A",
    // Add known OpenRouter models with their token limits if available
  };

  // Hardcoded costs for demonstration
  const knownCosts = {
    "openai/codex-mini": { input: "$1.50", output: "$6" },
    "openai/codex-mini-latest": { input: "$1.50", output: "$6" },
    "openai/o4-mini-high": { input: "$1.10", output: "$4.40" },
    "openai/o3": { input: "$10", output: "$40" },
    "openai/o4-mini": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4.1": { input: "$2", output: "$8" },
    "openai/gpt-4.1-mini": { input: "$0.40", output: "$1.60" },
    "openai/gpt-4.1-nano": { input: "$0.10", output: "$0.40" },
    "openai/o1-pro": { input: "$150", output: "$600" },
    "openai/gpt-4o-mini-search-preview": { input: "$0.15", output: "$0.60" },
    "openai/gpt-4o-search-preview": { input: "$2.50", output: "$10" },
    "openai/gpt-4.5-preview": { input: "$75", output: "$150" },
    "openai/o3-mini-high": { input: "$1.10", output: "$4.40" },
    "openai/o3-mini": { input: "$1.10", output: "$4.40" },
    "openai/o1": { input: "$15", output: "$60" },
    "openai/gpt-4o-2024-11-20": { input: "$2.50", output: "$10" },
    "openai/o1-preview": { input: "$15", output: "$60" },
    "openai/o1-preview-2024-09-12": { input: "$15", output: "$60" },
    "openai/o1-mini": { input: "$1.10", output: "$4.40" },
    "openai/o1-mini-2024-09-12": { input: "$1.10", output: "$4.40" },
    "openai/chatgpt-4o-latest": { input: "$5", output: "$15" },
    "openai/gpt-4o-2024-08-06": { input: "$2.50", output: "$10" },
    "openai/gpt-4o-mini": { input: "$0.15", output: "$0.60" },
    "openai/gpt-4o-mini-2024-07-18": { input: "$0.15", output: "$0.60" },
    "openai/gpt-4o": { input: "$2.50", output: "$10" },
    "openai/gpt-4o:extended": { input: "$6", output: "$18" },
    "openai/gpt-4o-2024-05-13": { input: "$5", output: "$15" },
    "openai/gpt-4-turbo": { input: "$10", output: "$30" },
    "openai/gpt-4-turbo-preview": { input: "$10", output: "$30" },
    "openai/gpt-3.5-turbo-1106": { input: "$1", output: "$2" },
    "openai/gpt-3.5-turbo-instruct": { input: "$1.50", output: "$2" },
    "openai/gpt-3.5-turbo-16k": { input: "$3", output: "$4" },
    "openai/gpt-4-32k": { input: "$60", output: "$120" },
    "openai/gpt-4-32k-0314": { input: "$60", output: "$120" },
    "openai/gpt-3.5-turbo": { input: "$0.50", output: "$1.50" },
    "openai/gpt-3.5-turbo-0125": { input: "$0.50", output: "$1.50" },
    "openai/gpt-4": { input: "$30", output: "$60" },
    "openai/gpt-4-0314": { input: "$30", output: "$60" },
    // OpenRouter costs can be added here if available
  };

  function resolveModelKey(originalId, knownTokenLimits, provider) {
    const prefix = provider === "openai" ? "openai/" : "openrouter/";
    return `${prefix}${originalId}`;
  }

  try {
    const openAIClient = getOpenAiClient('openai');
    const openAIModelList = await openAIClient.models.list();
    const openAIModelIds = openAIModelList.data.map((m) => m.id).sort();
    const openAIModelData = openAIModelIds.map((id) => {
      const prefixedId = resolveModelKey(id, knownTokenLimits, "openai");
      const limit = knownTokenLimits[prefixedId] || "N/A";
      const costInfo = knownCosts[prefixedId]
        ? { inputCost: knownCosts[prefixedId].input, outputCost: knownCosts[prefixedId].output }
        : { inputCost: "N/A", outputCost: "N/A" };
      return {
        id: prefixedId,
        tokenLimit: limit,
        inputCost: costInfo.inputCost,
        outputCost: costInfo.outputCost
      };
    });

    // Fetch OpenRouter models
    const openRouterKey = process.env.OPENROUTER_API_KEY || "";
    let openRouterModelData = [];
    if (openRouterKey) {
      try {
        console.debug("[Server Debug] Fetching OpenRouter models.");
        const orResp = await axios.get("https://openrouter.ai/api/v1/models", {
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "HTTP-Referer": "Alfe-DevAgent",
            "X-Title": "Alfe Dev",
          },
        });
        const orModelIds = orResp.data?.data?.map((m) => m.id).sort() || [];
        openRouterModelData = orModelIds.map((id) => {
          const prefixedId = resolveModelKey(id, knownTokenLimits, "openrouter");
          const limit = knownTokenLimits[prefixedId] || "N/A";
          const costInfo = knownCosts[prefixedId]
            ? { inputCost: knownCosts[prefixedId].inputCost, outputCost: knownCosts[prefixedId].outputCost }
            : { inputCost: "N/A", outputCost: "N/A" };
          return {
            id: prefixedId,
            tokenLimit: limit,
            inputCost: costInfo.inputCost,
            outputCost: costInfo.outputCost
          };
        });
      } catch (err) {
        console.error("[TaskQueue] Error fetching OpenRouter models:", err);
      }
    } else {
      console.warn("[TaskQueue] OPENROUTER_API_KEY not set; skipping OpenRouter models.");
    }

    // Combine both OpenAI and OpenRouter models
    const combinedModels = [...openAIModelData, ...openRouterModelData].sort((a, b) => a.id.localeCompare(b.id));

    res.json({ models: combinedModels });
  } catch (err) {
    console.error("[TaskQueue] /api/ai/models error:", err);
    res.status(500).json({ error: err.message });
  }
});

# ... [Rest of server.js remains unchanged] ...

// 