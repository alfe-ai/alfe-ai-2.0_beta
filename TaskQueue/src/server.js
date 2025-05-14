import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import TaskDB from "./taskDb.js";
import GitHubClient from "./githubClient.js";
import multer from "multer";

// Updated OpenAI SDK import and initialization
import OpenAI from "openai";

// Token counting
import { encoding_for_model } from "tiktoken";

// Added axios import to fix require() error:
import axios from "axios";

// Import other AI SDKs as needed (e.g., for OpenRouter, LiteLLM, DeepSeek)

const db = new TaskDB();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ... [Rest of your existing server setup code] ...

// AI Providers and Models
const AI_PROVIDERS = {
  "openai": {
    models: ["gpt-3.5-turbo", "gpt-4"]
  },
  "openrouter": {
    models: ["openrouter-model-1", "openrouter-model-2"]
  },
  "litellm": {
    models: ["litellm-model-1", "litellm-model-2"]
  },
  "deepseek api": {
    models: ["deepseek-api-model"]
  },
  "deepseek local": {
    models: ["deepseek-local-model"]
  }
};

// GET /api/ai/providers
app.get("/api/ai/providers", (req, res) => {
  try {
    const providers = Object.keys(AI_PROVIDERS);
    const selectedProvider = db.getSetting("ai_provider") || "openai";
    res.json({ providers, selectedProvider });
  } catch (err) {
    console.error("Error in GET /api/ai/providers:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/ai/models
app.get("/api/ai/models", (req, res) => {
  try {
    const provider = req.query.provider || db.getSetting("ai_provider") || "openai";
    const models = AI_PROVIDERS[provider]?.models || [];
    const selectedModel = db.getSetting("ai_model") || models[0] || "";
    res.json({ models, selectedModel });
  } catch (err) {
    console.error("Error in GET /api/ai/models:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/ai/settings
app.post("/api/ai/settings", (req, res) => {
  try {
    const { provider, model } = req.body;
    if (!provider || !model) {
      return res.status(400).json({ error: "Provider and model are required" });
    }
    db.setSetting("ai_provider", provider);
    db.setSetting("ai_model", model);
    res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/ai/settings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Updated /api/chat endpoint to use selected AI provider and model
app.post("/api/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "";
    const chatTabId = req.body.tabId || 1;
    const userTime = req.body.userTime || new Date().toISOString();

    if (!userMessage) {
      return res.status(400).send("Missing message");
    }

    // Gather entire conversation history
    const priorPairs = db.getAllChatPairs(chatTabId);

    // Get selected AI provider and model
    const aiProvider = db.getSetting("ai_provider") || "openai";
    const aiModel = db.getSetting("ai_model") || "gpt-3.5-turbo";

    const savedInstructions = db.getSetting("agent_instructions") || "";
    const systemContext = `System Context:\n${savedInstructions}\n\nProvider: ${aiProvider}\nModel: ${aiModel}\nUserTime: ${userTime}\nTimeZone: Central`;

    const conversation = [{ role: "system", content: systemContext }];

    // Add all previous user/assistant messages
    for (const p of priorPairs) {
      conversation.push({ role: "user", content: p.user_text });
      if (p.ai_text) {
        conversation.push({ role: "assistant", content: p.ai_text });
      }
    }

    // Insert user message into chat_pairs table (pending AI response)
    const chatPairId = db.createChatPair(userMessage, chatTabId, systemContext);

    // Finally, push the latest user message
    conversation.push({ role: "user", content: userMessage });

    // Log user chat
    db.logActivity("User chat", JSON.stringify({ tabId: chatTabId, message: userMessage, userTime }));

    // Start streaming response
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    let assistantMessage = "";

    // Implement provider-specific API calls
    if (aiProvider === "openai") {
      const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || ""
      });

      const stream = await openaiClient.chat.completions.create({
        model: aiModel,
        messages: conversation,
        stream: true
      });

      for await (const part of stream) {
        const chunk = part.choices?.[0]?.delta?.content || "";
        if (chunk.includes("[DONE]")) {
          break;
        }
        assistantMessage += chunk;
        res.write(chunk);
      }

    } else if (aiProvider === "openrouter") {
      // Implement OpenRouter API call
      // Example placeholder:
      // const response = await openRouterClient.chat({ model: aiModel, messages: conversation });
      // assistantMessage = response.message;
      // res.write(assistantMessage);

      res.write("[OpenRouter integration not implemented]");
      assistantMessage = "[OpenRouter response]";
    } else if (aiProvider === "litellm") {
      // Implement LiteLLM API call
      res.write("[LiteLLM integration not implemented]");
      assistantMessage = "[LiteLLM response]";
    } else if (aiProvider === "deepseek api" || aiProvider === "deepseek local") {
      // Implement DeepSeek API or Local call
      res.write("[DeepSeek integration not implemented]");
      assistantMessage = "[DeepSeek response]";
    } else {
      res.write("[Unknown AI provider]");
      assistantMessage = "[Error: Unknown AI provider]";
    }

    res.end();

    // Now let's calculate token usage
    const encoder = getEncoding(aiModel);
    const systemTokens = countTokens(encoder, systemContext);

    let prevAssistantTokens = 0;
    let historyTokens = 0;
    for (const p of priorPairs) {
      historyTokens += countTokens(encoder, p.user_text);
      prevAssistantTokens += countTokens(encoder, p.ai_text || "");
    }

    const inputTokens = countTokens(encoder, userMessage);
    const finalAssistantTokens = countTokens(encoder, assistantMessage);

    const total =
      systemTokens + historyTokens + inputTokens + prevAssistantTokens + finalAssistantTokens;

    const tokenInfo = {
      systemTokens,
      historyTokens,
      inputTokens,
      assistantTokens: prevAssistantTokens,
      finalAssistantTokens,
      total
    };

    db.finalizeChatPair(chatPairId, assistantMessage, aiModel, new Date().toISOString(), JSON.stringify(tokenInfo));

    db.logActivity("AI chat", JSON.stringify({ tabId: chatTabId, response: assistantMessage, tokenInfo }));
  } catch (err) {
    console.error("[TaskQueue] /api/chat (stream) error:", err);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

// ... [Rest of your existing routes and server code] ...

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[TaskQueue] Web server is running on port ${PORT} (verbose='true')`);
});
