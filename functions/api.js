// functions/api.js
export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const GITHUB_TOKEN = env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: 'Missing GITHUB_TOKEN' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let gistId = env.YRGN_KV ? await env.YRGN_KV.get('gist_id') : null;

  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'YRGN-Store-Pages-Function',
  };

  try {
    if (request.method === 'GET') {
      let url = null;

      if (gistId) {
        url = `https://api.github.com/gists/${gistId}`;
      } else {
        const listRes = await fetch('https://api.github.com/gists', { headers });
        if (listRes.ok) {
          const gists = await listRes.json();
          const targetGist = gists.find(g => g.description === '[YRGN STORE] Product Data');
          if (targetGist) {
            gistId = targetGist.id;
            if (env.YRGN_KV) await env.YRGN_KV.put('gist_id', gistId);
            url = `https://api.github.com/gists/${gistId}`;
          }
        }
      }

      if (url) {
        const res = await fetch(url, { headers });
        if (res.ok) {
          const gist = await res.json();
          const content = gist.files?.['products.json']?.content || '[]';
          return new Response(content, {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response('[]', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST') {
      const products = await request.json();

      const gistData = {
        description: '[YRGN STORE] Product Data',
        public: false,
        files: {
          'products.json': {
            content: JSON.stringify(products, null, 2),
          },
        },
      };

      let apiUrl;
      if (gistId) {
        apiUrl = `https://api.github.com/gists/${gistId}`;
        const res = await fetch(apiUrl, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(gistData),
        });

        if (!res.ok) throw new Error(`GitHub update failed: ${await res.text()}`);
      } else {
        apiUrl = 'https://api.github.com/gists';
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(gistData),
        });

        if (!res.ok) throw new Error(`GitHub create failed: ${await res.text()}`);
        const newGist = await res.json();
        gistId = newGist.id;
        if (env.YRGN_KV) await env.YRGN_KV.put('gist_id', gistId);
      }

      return new Response(JSON.stringify({ success: true, gist_id: gistId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}