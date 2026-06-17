export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const userId = 'default_user'; // 暂时没有登录系统，用固定ID

  // GET：读取数据
  if (req.method === 'GET') {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/todos?user_id=eq.${userId}&select=data`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await response.json();
    const data = rows.length > 0 ? rows[0].data : [];
    return res.status(200).json({ ok: true, data });
  }

  // POST：保存数据
  if (req.method === 'POST') {
    const todos = req.body;

    // 先查有没有这个用户的记录
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/todos?user_id=eq.${userId}`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const existing = await checkRes.json();

    if (existing.length > 0) {
      // 更新
      await fetch(
        `${SUPABASE_URL}/rest/v1/todos?user_id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ data: todos })
        }
      );
    } else {
      // 新建
      await fetch(
        `${SUPABASE_URL}/rest/v1/todos`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ user_id: userId, data: todos })
        }
      );
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
