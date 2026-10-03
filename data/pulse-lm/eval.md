# Pulse-LM vs Gemini on 20 held-out inputs

Run: 2026-10-03T06:04:01.079Z on local laptop (Apple M1, 8 GB). Both engines got the same single-call planner prompt. Pulse-LM runs in plain JSON mode, with no schema grammar. Code repairs invented enum values and missing flags, then our zod schema validates the result.

| Metric | Pulse-LM (hf.co/BansiRPatanvadiya/pulse-lm-qwen3-4b:Q4_K_M) | Gemini (gemini-3.5-flash-lite) |
|---|---|---|
| Valid JSON | 100% | 100% |
| Valid on the first try | 90% | 85% |
| Needed a code repair of a field value | 85% | 0% |
| Length rules respected | 55% | 5% |
| Shot plan needed no repair | 100% | 100% |
| Average narration words | 61.4 | 51.45 |
| Average Script Critic score | 6.6 | 7.41 |
| Average seconds per plan | 82.07 | 4.16 |
| Tokens per second | 9.69 | n/a |

Decision rule: valid JSON >= 95%, length respected >= 90%, critic score within about 1 point of Gemini.
Result: valid JSON met, length not met, score met (gap 0.81).
