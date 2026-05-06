// ─── Eval Constants ────────────────────────────────────────────────────────

// No more hardcoded built-in eval list.
// Built-in evals are determined by `isCustom: false` in the DB.
// Descriptions come from the `description` column in EvalPrompt.

export const NEW_EVAL_TEMPLATE = `You are an expert AI response evaluator.

Evaluate the quality of the RESPONSE based on the given CONTEXT and QUERY.
Consider accuracy, relevance, completeness, and faithfulness to the provided context.

CONTEXT:
{context}

QUERY:
{query}

RESPONSE:
{response}

Scoring:
- 1.0: Excellent — accurate, relevant, complete, and well-grounded
- 0.7-0.9: Good — mostly accurate with minor issues
- 0.4-0.6: Fair — partially correct but has notable gaps or inaccuracies
- 0.1-0.3: Poor — mostly incorrect or irrelevant
- 0.0: Completely wrong or off-topic

Respond with JSON only: {{"label": "pass" or "fail", "score": 0.0-1.0, "explanation": "one line"}}`;
