# Pulse-LM vs Gemini on 20 held-out inputs

Run: 2026-10-03T05:29:59.538Z on local laptop (Apple M1, 8 GB). Both engines got the same single-call planner prompt. Pulse-LM runs in plain JSON mode, with no schema grammar. Our zod schema validates the result.

| Metric | Pulse-LM (hf.co/BansiRPatanvadiya/pulse-lm-qwen3-4b:Q4_K_M) | Gemini (gemini-3.5-flash-lite) |
|---|---|---|
| Valid JSON | 20% | 100% |
| Valid on the first try | 20% | 85% |
| Length rules respected | 20% | 15% |
| Shot plan needed no repair | 20% | 100% |
| Average narration words | 67.25 | 53.15 |
| Average Script Critic score | 7.05 | 7.36 |
| Average seconds per plan | 90.16 | 5.01 |
| Tokens per second | 14.35 | n/a |

Decision rule: valid JSON >= 95%, length respected >= 90%, critic score within about 1 point of Gemini.
Result: valid JSON not met, length not met, score met (gap 0.31).
