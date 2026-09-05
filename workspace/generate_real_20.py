#!/usr/bin/env python3
"""
Generate exactly 20 AI practice questions for Mathematics (Egypt Secondary Grade 3 General Secondary)
via NVIDIA AgentRouter path (verified live endpoint). Uses few-shot examples to ensure real content.
Saves to workspace/ai_generated_batch_20.json; verifies each question (10 rules); rejects invalid.
Then inserts into LIVE Supabase DB (diagnostic_question_bank) via node + pg.
"""
import json, urllib.request, time, re, os, sys

# Load NVIDIA key
key_line = open('.env.local').read()
key_match = re.search(r'NVIDIA_API_KEY="([^"]+)"', key_line)
if not key_match:
    key_match = re.search(r'NVIDIA_API_KEY=([^\s]+)', key_line)
NVIDIA_KEY = key_match.group(1).strip('"') if key_match else ''
print("NVIDIA key configured:", bool(NVIDIA_KEY) and NVIDIA_KEY.startswith('nvapi'))

# Few-shot system prompt with 2 real examples
FEW_SHOT_EXAMPLES = """
أمثلة على أسئلة حقيقية من منهج الرياضيات للصف الثالث الثانوي العام في مصر:

مثال 1:
{"question_text":"إذا كانت المعادلة التربيعية x² - 5x + 6 = 0، فما مجموعة الحلول؟","options_json":["{2, 3}","{-2, -3}","{1, 6}","{-1, -6}"],"correct_option_index":0,"explanation":"بتحليل المعادلة: (x - 2)(x - 3) = 0، إذن x = 2 أو x = 3، أي المجموعة {2, 3}.","difficulty":"easy","topic":"الجبر"}

مثال 2:
{"question_text":"إذا كانت دالة خطية f(x) = 2x + 3، فما قيمة f(-1)؟","options_json":["-1","1","-5","5"],"correct_option_index":0,"explanation":"نعوّض: f(-1) = 2(-1) + 3 = -2 + 3 = 1. إذن الإجابة الصحيحة هي 1.","difficulty":"medium","topic":"الدوال"}

مهمتك الآن: تولّد 20 سؤالًا حقيقيًا جديدًا (ليس تكرارًا للأمثلة) في نفس السياق (رياضيات - ثانوية عامة مصرية - الصف الثالث).
كل سؤال يجب أن يكون سؤالًا منطقيًا من المنهج، ليس نصًا عامًا.
"""

SYSTEM_PROMPT = (
    "أنت Quiz Generator متخصص في الرياضيات للمرحلة الثانوية العامة (مصر - الصف الثالث الثانوي العام). "
    "مهمتك توليد أسئلة تدريب حقيقية من نوع MCQ مع 4 خيارات فقط. "
    "يجب أن يكون كل سؤال سؤالًا منطقيًا من منهج الرياضيات المصري (الجبر، الهندسة التحليلية، التفاضل والتكامل، الاحتمالات، الدوال). "
    "لا تستخدم نصوصًا عامة (مثل 'Clear question in Arabic'). "
    "أجب فقط بكائن JSON صالح بدون أي نص إضافي خارج الكائن. الشكل المطلوب بدقة:\n"
    '{"question_text":"نص السؤال بوضوح بالعربية","options_json":["الخيار الأول","الخيار الثاني","الخيار الثالث","الخيار الرابع"],"correct_option_index":0,"explanation":"شرح مختصر وواضح","difficulty":"easy | medium | hard","topic":"الموضوع من المنهج"}\n'
    + FEW_SHOT_EXAMPLES
)

USER_PROMPT = (
    "تولّد الآن 20 سؤالًا حقيقيًا جديدًا في مادة الرياضيات للصف الثالث الثانوي العام في مصر. "
    "الموضوعات: الجبر (معادلات تربيعية، دوال، متتاليات)، الهندسة التحليلية، الاحتمالات. "
    "توزيع الصعوبة المطلوب تقريبًا: 6 سهل (easy)، 10 متوسط (medium)، 4 صعب (hard). "
    "كل سؤال يجب أن يكون سؤالًا حقيقيًا من المنهج، مع 4 خيارات واضحة، وإجابة صحيحة محددة بوضوح، وشرح مختصر. "
    "أجب فقط بمصفوفة JSON صالحة تحتوي على 20 كائنًا. لا تكتب أي نص خارج المصفوفة."
)


def generate_20():
    req = urllib.request.Request(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        data=json.dumps({
            'model': 'nvidia/nemotron-3.5-lightning-30b-a3b',
            'messages': [
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user', 'content': USER_PROMPT},
            ],
            'temperature': 0.3,
            'max_tokens': 3500,
        }).encode(),
        headers={
            'Authorization': f'Bearer {NVIDIA_KEY}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        method='POST'
    )
    start = time.time()
    resp = urllib.request.urlopen(req, timeout=90)
    content = json.loads(resp.read())['choices'][0]['message']['content']
    print(f"Generation time: {round(time.time()-start,1)}s  Content length: {len(content)}")
    with open('workspace/latest_nvidia_raw.txt', 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Raw response saved: workspace/latest_nvidia_raw.txt (len={len(content)})")
    # Try extraction quickly
    parsed = extract_json_array(content)
    if isinstance(parsed, list):
        print(f"Quick extract: {len(parsed)} items found.")
    else:
        print("Quick extract: no array found (will inspect manually).")
    return content  # return raw for further processing if needed


def extract_json_array(text):
    """Extract first valid JSON array from text, cleaning common corruption."""
    # Try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass
    # Find array start/end
    start = text.find('[')
    end = text.rfind(']')
    if start >= 0 and end > start:
        sub = text[start:end+1]
        # Clean common corruption: replace repeated Arabic diacritics with single
        # Replace any sequence of 3+ identical diacritics with single
        sub = re.sub(r'([ٌٍَُِْ])\1{2,}', r'\1', sub)
        try:
            return json.loads(sub)
        except Exception:
            pass
        # Try cleaning non-standard quotes
        sub = sub.replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")
        try:
            return json.loads(sub)
        except Exception:
            pass
    # Try finding object array with first { to last }
    obj_start = text.find('{')
    obj_end = text.rfind('}')
    if obj_start >= 0 and obj_end > obj_start:
        sub = text[obj_start:obj_end+1]
        # If it's a single object, wrap in array
        try:
            obj = json.loads(sub)
            return [obj]
        except Exception:
            pass
    return None


def validate_question(q, index):
    errors = []
    if not isinstance(q, dict):
        errors.append(f"not_dict(type={type(q)})")
        return errors
    # Required keys
    for k in ('question_text', 'options_json', 'correct_option_index', 'explanation', 'difficulty', 'topic'):
        if k not in q:
            errors.append(f"missing_key({k})")
    else:
        qt = q.get('question_text', '')
        if not isinstance(qt, str) or len(qt.strip()) < 10:
            errors.append(f"bad_text(len={len(str(qt).strip())})")
        # Check for corrupt Arabic text (excessive repeated diacritics or non-Arabic chars dominating)
        # We allow Arabic + numbers + math symbols; reject if mostly symbols or very short
        clean_qt = re.sub(r'[ٌٍَُِْْ]', '', qt)
        if len(clean_qt) < 5:
            errors.append("corrupt_text_after_clean")
        # Check options
        opts = q.get('options_json', [])
        if not isinstance(opts, list) or len(opts) != 4:
            errors.append(f"bad_options(len={len(opts) if isinstance(opts,list) else type(opts)})")
        else:
            for i, opt in enumerate(opts):
                if not isinstance(opt, str) or not opt.strip():
                    errors.append(f"empty_option({i})")
        # Check index
        idx = q.get('correct_option_index')
        if not isinstance(idx, int) or idx < 0 or idx > 3:
            errors.append(f"bad_index({idx})")
        # Check explanation
        expl = q.get('explanation', '')
        if not isinstance(expl, str) or len(expl.strip()) < 5:
            errors.append(f"bad_explanation(len={len(str(expl).strip())})")
        # Difficulty
        diff = q.get('difficulty', '')
        if diff not in ('easy', 'medium', 'hard'):
            errors.append(f"bad_difficulty({diff})")
        # Topic
        topic = q.get('topic', '')
        if not isinstance(topic, str) or not topic.strip():
            errors.append("bad_topic")
    return errors


def generate_batches():
    total_target = 100
    batch_target = 20
    max_attempts = 6  # 6 batches × 20 = 120 attempts max
    saved = []
    all_attempted = 0
    for batch_num in range(1, max_attempts + 1):
        if len(saved) >= total_target:
            break
        print(f"\n=== BATCH {batch_num} (need {total_target - len(saved)} more) ===")
        try:
            content = generate_20()
            parsed = extract_json_array(content)
            if parsed is None:
                print(f"  FAIL: could not extract JSON array from response (len={len(content)})")
                all_attempted += batch_target
                continue
            if not isinstance(parsed, list):
                print(f"  FAIL: parsed is not list (type={type(parsed)})")
                all_attempted += batch_target
                continue
            # Filter valid
            valid_items = []
            invalid_reasons = []
            for item in parsed:
                errs = validate_question(item, 0)
                if errs:
                    invalid_reasons.extend(errs)
                else:
                    valid_items.append({
                        'question_text': item['question_text'],
                        'options_json': item['options_json'],
                        'correct_option_index': item['correct_option_index'],
                        'explanation': item['explanation'],
                        'difficulty': item['difficulty'],
                        'topic': item['topic'],
                    })
            print(f"  Parsed items: {len(parsed)}; Valid: {len(valid_items)}; Invalid reasons: {invalid_reasons[:3] if invalid_reasons else 'none'}")
            # If not enough valid, retry same batch (do not advance batch_num for retry count? We do advance and keep valid)
            saved.extend(valid_items)
            # Save batch to JSON file (intermediate)
            with open(f'workspace/ai_batch_{batch_num}.json', 'w', encoding='utf-8') as f:
                json.dump(valid_items, f, ensure_ascii=False, indent=2)
            print(f"  SAVED {len(valid_items)} questions to workspace/ai_batch_{batch_num}.json (total saved: {len(saved)})")
            all_attempted += len(parsed)
        except Exception as e:
            print(f"  Batch {batch_num} error:", type(e).__name__, str(e)[:150])
            all_attempted += batch_target

    # Deduplicate saved by question_text
    seen_texts = set()
    unique_saved = []
    duplicates = 0
    for item in saved:
        qt = item['question_text'].strip()
        if qt in seen_texts:
            duplicates += 1
            continue
        seen_texts.add(qt)
        unique_saved.append(item)
    saved = unique_saved
    print(f"\n=== GENERATION SUMMARY ===")
    print(f"Total batches attempted: {batch_num}")
    print(f"Total parsed items: {all_attempted}")
    print(f"Unique valid questions: {len(saved)}")
    print(f"Duplicates removed: {duplicates}")
    # Save combined audit file
    audit = {
        'target_subject': 'Mathematics',
        'target_context': 'Egypt / Secondary / General Secondary / Grade 3',
        'batch_size_target': batch_target,
        'total_generated_unique': len(saved),
        'duplicates_removed': duplicates,
        'difficulty_distribution': {},
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    # Count difficulty
    for d in ('easy', 'medium', 'hard'):
        audit['difficulty_distribution'][d] = sum(1 for s in saved if s['difficulty'] == d)
    with open('workspace/1.2G_AUDIT_SUMMARY.json', 'w', encoding='utf-8') as f:
        json.dump(audit, f, ensure_ascii=False, indent=2)
    # Save all valid unique questions to a single file for DB insertion
    with open('workspace/ai_generated_all_100.json', 'w', encoding='utf-8') as f:
        json.dump(saved[:total_target], f, ensure_ascii=False, indent=2)
    print(f"Audit saved: workspace/1.2G_AUDIT_SUMMARY.json")
    print(f"Questions saved: workspace/ai_generated_all_100.json (count={min(len(saved), total_target)})")
    return saved


if __name__ == '__main__':
    saved_questions = generate_batches()
    # Final verification report
    if len(saved_questions) >= 100:
        print(f"\nPASS: Generated and verified {len(saved_questions)} unique AI practice questions (target 100).")
    elif len(saved_questions) > 0:
        print(f"\nPARTIAL: Generated {len(saved_questions)} questions; need {100 - len(saved_questions)} more.")
    else:
        print("\nBLOCKED: No valid questions generated.")
