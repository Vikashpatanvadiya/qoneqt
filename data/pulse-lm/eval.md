# Pulse-LM vs Gemini on 20 held-out inputs

Run: 2026-10-02T20:25:45.207Z on local laptop (Apple M1, 8 GB). Both engines got the same single-call planner prompt. Pulse-LM output is constrained to the JSON schema by the server.

| Metric | Pulse-LM (hf.co/BansiRPatanvadiya/pulse-lm-qwen3-4b:Q4_K_M) | Gemini (gemini-3.5-flash-lite, gemini-3.1-flash-lite) |
|---|---|---|
| Valid JSON | 100% | 100% |
| Valid on the first try | 100% | 85% |
| Length rules respected | 35% | 20% |
| Shot plan needed no repair | 0% | 100% |
| Average narration words | 58.35 | 52.55 |
| Average Script Critic score | 6.59 | 7.38 |
| Average seconds per plan | 51.11 | 4.6 |
| Tokens per second | 11.98 | n/a |

Decision rule: valid JSON >= 95%, length respected >= 90%, critic score within about 1 point of Gemini.
Result: valid JSON met, length not met, score met (gap 0.79).
