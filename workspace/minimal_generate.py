
import sys, time
sys.path.insert(0, '.')
exec(open('workspace/generate_real_20.py').read())
content = generate_20()
print('Done. Length:', len(content))
