{
  "agent": "quiz_generator",
  "context": {
    "language": "arabic",
    "subject": "Mathematics",
    "stage": "Secondary",
    "grade": "Grade 3",
    "curriculum": "General Secondary",
    "country": "Egypt",
    "role": "student"
  },
  "request": {
    "task": "Generate 100 AI practice questions for Egypt Secondary Mathematics (Algebra & Analytic Solid Geometry)",
    "question_type": [
      "mcq"
    ],
    "count": 100,
    "difficulty_distribution": {
      "easy": 30,
      "medium": 50,
      "hard": 20
    },
    "language": "arabic",
    "structured_output": {
      "questions": [
        {
          "question_text": "string",
          "question_type": "mcq",
          "options_json": [
            "string",
            "string",
            "string",
            "string"
          ],
          "correct_option_index": 0,
          "explanation": "string",
          "difficulty": "easy | medium | hard"
        }
      ]
    },
    "rules": [
      "Generate ONLY new AI-generated practice questions (not official exam copies)",
      "Questions must be Mathematics-related (Secondary grade 3)",
      "Each question must have 4 options (A/B/C/D format implied) with exactly one correct",
      "Correct option index must be 0-3 (deterministic) — not invented",
      "Difficulty: use specified distribution",
      "Questions in Arabic (primary); options in Arabic",
      "No mock content — real structured output from AI agent",
      "Clearly label source_type='ai_generated' — separate from verified/official"
    ],
    "source_type_output": "ai_generated",
    "batch_size_limit": 20
  },
  "batch_info": {
    "batch_id": "1.2g_math_2023_batch_1",
    "country": "Egypt",
    "stage": "Secondary",
    "grade": "Grade 3",
    "subject": "Mathematics",
    "curriculum": "General Secondary",
    "count_target": 100,
    "count_completed": 0,
    "rejected": 0,
    "duplicates_detected": 0,
    "status": "in_progress",
    "created_at": "2026-09-03"
  }
}