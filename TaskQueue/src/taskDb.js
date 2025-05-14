import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);
    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Schema bootstrap & migrations                                     */
  /* ------------------------------------------------------------------ */
  _init() {
    // ... [Rest of your existing schema initialization code] ...

    // Add ai_provider and ai_model settings
    // No need to modify schema since settings are stored in the settings table
  }

  // ... [Rest of your existing methods] ...

  /* ------------------------------------------------------------------ */
  /*  AI Provider and Model Settings                                    */
  /* ------------------------------------------------------------------ */

  getAIProvider() {
    return this.getSetting("ai_provider") || "openai";
  }

  setAIProvider(provider) {
    this.setSetting("ai_provider", provider);
  }

  getAIModel() {
    return this.getSetting("ai_model") || "gpt-3.5-turbo";
  }

  setAIModel(model) {
    this.setSetting("ai_model", model);
  }
}
