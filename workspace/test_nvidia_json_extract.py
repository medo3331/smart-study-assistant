#!/usr/bin/env python3
import json, urllib.request, time, re, os, sys

key_line = open('.env.local').read().split('NVIDIA_API_KEY=')[1].split()[0].strip('"')
key = key_line
req_data = {
    'model': 'nvidia/nemotron-3.5-lightning-30b-a3b',
    'messages': [
        {'role': 'system', 'content': 'أنت Quiz Generator متخصص في الرياضيات للمرحلة الثانوية العامة المصرية. أجب فقط بكائن JSON صالح بدون أي نص إضافي. الشكل المطلوب: [{"question_text":"نص السؤال","options_json":["الخيار أ","الخيار ب","الخيار ج","الخيار د"],"correct_option_index":0,"explanation":"شرح مختصر بالعربية","difficulty":"easy","topic":"الجبر"}]. لا تكتب أي نص خارج الكائن.'},
        {'role': 'user', 'content': 'تولّد 2 سؤال تدريب فقط في الرياضيات (الجبر) للصف الثالث الثانوي العام في مصر. كل سؤال MCQ مع 4 خيارات. الإجابة الصحيحة يجب أن تكون واضحة.'}
    ],
    'temperature': 0.2,
    'max_tokens': 1500,
}
req = urllib.request.Request('https://integrate.api.nvidia.com/v1/chat/completions',
    data=json.dumps(req_data).encode(),
    headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
    method='POST')
start = time.time()
resp = urllib.request.urlopen(req, timeout=100)
content = json.loads(resp.read())['choices'][0]['message']['content']
print('TIME:', round(time.time()-start, 1), 'len:', len(content))
# Save to workspace
with open('workspace/nvidia_response.json', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved workspace/nvidia_response.json')
# Try to extract JSON array
# Find first '[' to last ']'
start_idx = content.find('[')
end_idx = content.rfind(']')
if start_idx >= 0 and end_idx > start_idx:
    try:
        arr = json.loads(content[start_idx:end_idx+1])
        print('JSON ARRAY EXTRACTED, items:', len(arr))
        for i, item in enumerate(arr):
            opts = item.get('options_json', [])
            print('  Q', i+1, 'len_text=', len(str(item.get('question_text',''))), 'opts=', len(opts) if isinstance(opts, list) else opts, 'idx=', item.get('correct_option_index'), 'diff=', item.get('difficulty'), 'topic=', item.get('topic','')[:15])
    except Exception as e:
        print('JSON PARSE FAIL:', e)
        print('First 500 chars of substring:')
        print(content[start_idx:start_idx+500])
else:
    print('No array brackets found.')
    print('FIRST 1500 chars:')
    print(content[:1500])
