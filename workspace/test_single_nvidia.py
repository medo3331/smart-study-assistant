#!/usr/bin/env python3
"""Generate 1 test question via NVIDIA and verify JSON validity + Arabic text quality."""
import json, urllib.request, time, re, sys, os

key = open('.env.local').read().split('NVIDIA_API_KEY=')[1].split()[0].strip('"')

system = (
    "أنت Quiz Generator متخصص في الرياضيات للمرحلة الثانوية العامة (مصر - الصف الثالث الثانوي العام). "
    "مهمتك توليد سؤال واحد فقط من نوع اختيار من متعدد (MCQ) مع 4 خيارات (أ، ب، ج، د). "
    "يجب أن يكون نص السؤال واضحًا بالعربية الفصحى بدون أي رموز زائدة أو تشويش. "
    "أجب فقط بكائن JSON صالح بدون أي نص إضافي خارج الكائن. "
    "الشكل المطلوب بدقة: "
    '{"question_text":"نص السؤال هنا بوضوح","options_json":["الخيار الأول","الخيار الثاني","الخيار الثالث","الخيار الرابع"],"correct_option_index":0,"explanation":"شرح مختصر وواضح للعربية","difficulty":"easy","topic":"الجبر"}'
)

user = 'تولّد سؤالًا واحدًا فقط في مادة الجبر (معادلة من الدرجة الثانية) بصعوبة متوسطة للصف الثالث الثانوي العام. يجب أن يكون السؤال حقيقيًا ومناسبًا للمنهج المصري.'

req = urllib.request.Request('https://integrate.api.nvidia.com/v1/chat/completions',
    data=json.dumps({'model':'nvidia/nemotron-3.5-lightning-30b-a3b',
        'messages':[{'role':'system','content':system},{'role':'user','content':user}],
        'temperature':0.2,'max_tokens':800}).encode(),
    headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'}, method='POST')
start = time.time()
resp = urllib.request.urlopen(req, timeout=60)
content = json.loads(resp.read())['choices'][0]['message']['content']
print('TIME:', round(time.time()-start,1))
# Try to extract JSON object (not array) directly
obj = None
# Find first { to last }
start_idx = content.find('{')
end_idx = content.rfind('}')
if start_idx >= 0 and end_idx > start_idx:
    try:
        obj = json.loads(content[start_idx:end_idx+1])
        print('JSON OBJECT EXTRACTED SUCCESSFULLY')
    except Exception as e:
        print('JSON OBJECT PARSE FAIL:', e)
        # Try to clean corrupt Arabic text (remove excessive diacritics / repeated chars)
        cleaned_substr = content[start_idx:end_idx+1]
        # If it fails, try to just show substring
        print('Substring preview (first 600):', cleaned_substr[:600])
else:
    print('No JSON object brackets found.')
    print('Content preview:', content[:800])

if obj:
    print('Keys:', list(obj.keys()))
    qt = obj.get('question_text', '')
    print('question_text length:', len(qt), '| value:', qt[:120])
    # Check for corrupt Arabic: repeated diacritics (e.g., many ِّ or َ)
    corrupt = bool(re.search(r'[ٌٍَُِْ]{10,}', qt))
    print('Corrupt Arabic detected:', corrupt)
    opts = obj.get('options_json', [])
    print('Options count:', len(opts) if isinstance(opts, list) else opts)
    print('Correct index:', obj.get('correct_option_index'))
    print('Difficulty:', obj.get('difficulty'))
    print('Topic:', obj.get('topic'))
    # Save clean object
    with open('workspace/test_single_question.json', 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    print('Saved workspace/test_single_question.json')
