// What each pipeline stage is called in the UI, and the order a job goes through them.
export const STAGE_INFO: Record<string, { title: string; agent: string; blurb: string }> = {
  ingest: { title: "Ingest", agent: "Pipeline", blurb: "Reads the input and loads the Community Brain" },
  voiceover: { title: "Your voiceover", agent: "faster-whisper", blurb: "Transcribes your recording with word timings" },
  plan: { title: "Pulse-LM planner", agent: "Our fine-tuned model", blurb: "Writes the script and shot plan in one call" },
  research: { title: "Researcher", agent: "Agent", blurb: "Finds three angles and picks the one most likely to get comments" },
  script: { title: "Scriptwriter", agent: "Agent", blurb: "Writes the hook, narration and on-screen text" },
  script_critic: { title: "Script Critic", agent: "Agent", blurb: "Scores the script and sends it back until it is strong" },
  direct: { title: "Director", agent: "Agent", blurb: "Plans every shot: layout, image, camera, transition, captions, music" },
  assets: { title: "Assets", agent: "Image + voice", blurb: "Generates images and voice, measures real timing (or applies your edits)" },
  vision_critic: { title: "Vision Critic", agent: "Agent", blurb: "Looks at real frames and fixes bad scenes" },
  render: { title: "Render", agent: "Remotion", blurb: "Builds the 1080x1920 video" },
  qa: { title: "QA gate", agent: "Code checks", blurb: "Measures duration, safe zones, contrast, loudness, file size" },
  upload: { title: "Ready to publish", agent: "Storage", blurb: "Uploads the video and thumbnail" },
};

export const EXPECTED_STAGES: Record<string, string[]> = {
  gemini: ["ingest", "research", "script", "script_critic", "direct", "assets", "vision_critic", "render", "qa", "upload"],
  "pulse-lm": ["ingest", "plan", "script_critic", "assets", "vision_critic", "render", "qa", "upload"],
};
