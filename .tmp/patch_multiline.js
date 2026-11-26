const fs=require('fs');
const base='C:/Desktop/smart-study-assistant/.worktrees/phase1-ai-credits/';

function norm(c){ return c.replace(/\r\n/g, '\n'); }
function undot(c){ return c.replace(/\n/g, '\r\n'); }

const multiLine=[
  {
    file:'app/api/ai/image-gen/route.ts',
    old:'    const guard = await guardAiAccessAndReserve(\n      supabase,\n      user.id,\n      OPENROUTER_IMAGE_MODELS["flux-2-pro"],\n    );',
    new:'    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(\n      supabase,\n      user.id,\n      OPENROUTER_IMAGE_MODELS["flux-2-pro"],\n      { operationId }\n    );',
  },
  {
    file:'app/api/ai/diagram/route.ts',
    old:'    const guard = await guardAiAccessAndReserve(\n      supabase,\n      user.id,\n      accessible[0]?.model ?? "openai/gpt-oss-120b"\n    );',
    new:'    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(\n      supabase,\n      user.id,\n      accessible[0]?.model ?? "openai/gpt-oss-120b",\n      { operationId }\n    );',
  },
  {
    file:'app/api/ai/file/generate/route.ts',
    old:'    const guard = await guardAiAccessAndReserve(\n      supabase,\n      user.id,\n      accessible[0]?.model ?? "openai/gpt-oss-120b"\n    );',
    new:'    const operationId = serverRequestId();\n    const guard = await guardAiAccessAndReserve(\n      supabase,\n      user.id,\n      accessible[0]?.model ?? "openai/gpt-oss-120b",\n      { operationId }\n    );',
  },
];

for(const t of multiLine){
  const p=base+t.file;
  let c=fs.readFileSync(p,'utf8');
  c=norm(c);
  if(!c.includes(t.old)){console.error('OLD NOT FOUND (normalized) @',t.file); process.exit(1);}
  c=c.replace(t.old,t.new);
  fs.writeFileSync(p,undot(c),'utf8');
  console.log('PATCHED multi-line: '+t.file);
}
