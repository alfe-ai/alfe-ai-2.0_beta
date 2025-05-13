import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import TaskDB from "./taskDb.js";
import GitHubClient from "./githubClient.js";

// Updated OpenAI SDK import and initialization
import OpenAI from "openai";
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ""
});

const db = new TaskDB();
const app = express();

[Rest of the file remains unchanged...]
