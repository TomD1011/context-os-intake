/**
 * COMPLETION_INSTRUCTION — the forced-submission directive.
 *
 * Shared by BOTH extraction paths so they can never drift:
 *   - /api/chat   (tool-forcing safety net)
 *   - /api/complete (decoupled forced completion)
 *
 * V2.5 (1 June 2026): adds the Voice Distillation step. The negative-space
 * voice fields (banned_phrases, anti_voice_samples) are distilled outputs —
 * founders rarely recite a clean ban list, so capturing only what's explicit
 * left these empty (see the voice-capture diagnosis). The model now derives
 * them from the full voice signal and flags anything it inferred.
 */
export const COMPLETION_INSTRUCTION =
  'The intake is complete. Call submit_intake_summary now with the full structured JSON for everything captured. Populate every required field; use "" or an empty array and a matching unresolved_gaps entry for anything never answered. Pull Sales OS answers verbatim. Before you submit, run the Voice Distillation step: derive banned_phrases and anti_voice_samples from the FULL voice signal — the founder\'s rant_about, their anti-voice/cringe answer, and any phrasing that contradicts their own voice_samples — not only from an explicit list. Lift signature_phrases verbatim from the voice_samples. Mark any entry you inferred rather than heard the founder state, and add an unresolved_gaps note so it can be confirmed. Never invent bans that are not grounded in what the founder actually said. Do not output prose.'
