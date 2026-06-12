// Feishu real-time message listener for AI Todo bot
// Spawns lark-cli event consume and processes incoming messages in real-time
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHAT_ID = 'oc_f7767040f4cb1995eef7a0a80add5323';
const DATA_FILE = path.join(__dirname, '..', '.workbuddy', 'todo-data.json');

// Start lark-cli event consumer
const child = spawn('lark-cli', [
  'event', 'consume',
  'im.message.receive_v1',
  '--as', 'bot',
  '--jq', '{msg_id: .message_id, content: .content, chat_id: .chat_id, sender_type: .sender?.sender_type}'
], {
  stdio: ['pipe', 'pipe', 'inherit']
});

let buffer = '';

child.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // keep incomplete line
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      handleEvent(event);
    } catch(e) {
      console.error('Parse error:', e.message);
    }
  }
});

child.on('close', (code) => {
  console.log('Event consumer exited with code', code);
});

async function handleEvent(event) {
  const { msg_id, content, chat_id, sender_type } = event;
  
  // Ignore bot's own messages
  if (!content || sender_type === 'app' || !chat_id) return;
  
  const text = content.trim();
  console.log(`[${new Date().toISOString()}] Message from user: "${text.slice(0, 50)}..."`);
  
  let reply = '';
  
  if (text.includes('查') && (text.includes('todo') || text.includes('待办') || text.includes('列表'))) {
    reply = await getTodoList();
  } else if (text.length > 100) {
    reply = extractTodos(text);
  } else if (text.includes('完成') || text.includes('搞定') || text.includes('做了')) {
    reply = '收到！请告诉我具体是哪条待办完成了？例如「完成了风控模型学习」';
  } else if (text.includes('处理') || text.includes('总结') || text.includes('提取')) {
    reply = '收到！请把长文发给我，我会帮你提取待办';
  } else {
    reply = '收到！你可以：\n• 发长文让我提取todo\n• 说「查待办」看列表\n• 「完成了XXX」标记完成';
  }
  
  if (reply) {
    sendReply(chat_id, reply);
  }
}

async function getTodoList() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
    const pending = data.filter(t => t.status !== 'completed');
    if (pending.length === 0) return '暂无待办事项';
    const lines = pending.slice(0, 10).map(t => 
      `• ${t.priorityLabel === 'high' ? '🔴' : t.priorityLabel === 'medium' ? '🟡' : '🟢'} ${t.title} ⏱️${t.estimatedMinutes || '?'}min`
    ).join('\n');
    return '📋 当前待办：\n' + lines;
  } catch(e) {
    return '暂无待办数据';
  }
}

function extractTodos(text) {
  // Quick extraction: look for numbered items and actionable sentences
  const lines = text.split(/[\n，,、；;]+/).map(l => l.trim()).filter(l => l.length > 3);
  const todos = lines.filter(l => 
    /^[\d]+[\.\)、]/.test(l) || 
    /[做学读写看练研究完成开展].{2,}/.test(l)
  ).slice(0, 8);
  
  if (todos.length === 0) return '未识别到待办项，请用编号或换行分隔';
  
  const clean = todos.map(t => t.replace(/^[\d]+[\.\)、]\s*/, '').replace(/[—\-]{1,3}.+$/, '').trim());
  return '🧠 提取到以下待办：\n' + clean.map((t, i) => `• ${t}`).join('\n');
}

function sendReply(chatId, text) {
  const escaped = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  execSync(`lark-cli im +messages-send --chat-id ${chatId} --as bot --text "${escaped}"`, {
    stdio: 'ignore',
    timeout: 10000
  });
}

console.log('AI Todo bot listener started. Waiting for messages...');
process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
